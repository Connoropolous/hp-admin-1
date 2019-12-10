import _ from 'lodash'
import { pickBy } from 'lodash/fp'
import { instanceCreateZomeCall } from '../holochainClient'
import { TYPE, STATUS, DIRECTION } from 'models/Transaction'
import { promiseMap } from 'utils'
import mockEarningsData from './mockEarningsData'

export const currentDataTimeIso = () => new Date().toISOString()
export const annulTransactionReaason = 'I need to revert the transaction.'

export const INSTANCE_ID = 'holofuel'
const createZomeCall = instanceCreateZomeCall(INSTANCE_ID)

const MOCK_DEADLINE = '4019-01-02T03:04:05.678901234+00:00'

/* Creates an array of all counterparties for a provided transaction list */
export async function getTxCounterparties (transactionList) {
  const counterpartyList = transactionList.map(({ counterparty }) => counterparty.id)
  const agentDetailsList = await promiseMap(counterpartyList, agentId => HoloFuelDnaInterface.user.getCounterparty({ agentId }))
  const noDuplicatesAgentList = _.uniqBy(agentDetailsList, 'id')
  return noDuplicatesAgentList
}

const presentRequest = ({ origin, event, stateDirection, eventTimestamp, counterpartyId, amount, notes, fees, status, reason }) => {
  return {
    id: origin,
    amount: amount || event.Request.amount,
    counterparty: {
      id: counterpartyId || event.Request.from
    },
    direction: stateDirection,
    status: status || STATUS.pending,
    type: TYPE.request,
    timestamp: eventTimestamp,
    notes: notes || event.Request.notes,
    fees,
    reason
  }
}

const presentOffer = ({ origin, event, stateDirection, eventTimestamp, counterpartyId, amount, notes, fees, status, reason }) => {
  return {
    id: origin,
    amount: amount || event.Promise.tx.amount,
    counterparty: {
      id: counterpartyId || event.Promise.tx.to
    },
    direction: stateDirection,
    status: status || STATUS.pending,
    type: TYPE.offer,
    timestamp: eventTimestamp,
    notes: notes || event.Promise.tx.notes,
    fees,
    reason
  }
}

const presentAcceptedPayment = async (acceptedPayment) => {
  const acceptedPaymentHash = acceptedPayment[1]
  if (acceptedPaymentHash.Err) throw new Error('There was an error accepting the payment for the referenced transaction. ERROR: ', acceptedPaymentHash.Err)

  const transactionId = acceptedPayment[0]
  const transaction = await HoloFuelDnaInterface.transactions.getPending(transactionId)

  return {
    ...transaction,
    id: transactionId,
    direction: DIRECTION.incoming, // this indicates the hf recipient
    status: STATUS.completed,
    type: TYPE.offer
  }
}

const presentReceipt = ({ origin, event, stateDirection, eventTimestamp, fees, presentBalance }) => {
  const counterpartyId = stateDirection === DIRECTION.incoming ? event.Receipt.cheque.invoice.promise.tx.from : event.Receipt.cheque.invoice.promise.tx.to
  return {
    id: origin,
    amount: event.Receipt.cheque.invoice.promise.tx.amount,
    counterparty: {
      id: counterpartyId
    },
    direction: stateDirection,
    status: STATUS.completed,
    type: stateDirection === DIRECTION.outgoing ? TYPE.request : TYPE.offer, // this indicates the original event type (eg. 'I requested hf from you', 'You sent a offer to me', etc.)
    timestamp: eventTimestamp,
    fees,
    presentBalance,
    notes: event.Receipt.cheque.invoice.promise.tx.notes
  }
}

// TODO: Review whether we should be showing this in addition to the receipt
const presentCheque = ({ origin, event, stateDirection, eventTimestamp, fees, presentBalance }) => {
  const counterpartyId = stateDirection === DIRECTION.incoming ? event.Cheque.invoice.promise.tx.from : event.Cheque.invoice.promise.tx.to
  return {
    id: origin,
    amount: event.Cheque.invoice.promise.tx.amount,
    counterparty: {
      id: counterpartyId
    },
    direction: stateDirection,
    status: STATUS.completed,
    type: event.Cheque.invoice.promise.request ? TYPE.request : TYPE.offer, // this indicates the original event type (eg. 'I requested hf from you', 'You sent a offer to me', etc.)
    timestamp: eventTimestamp,
    fees,
    presentBalance,
    notes: event.Cheque.invoice.promise.tx.notes
  }
}

function presentPendingRequest (transaction) {
  const { event, provenance } = transaction
  const origin = event[0]
  const stateDirection = DIRECTION.outgoing // this indicates the recipient of funds. (Note: This is an actionable Tx.)
  const eventTimestamp = event[1]
  const counterpartyId = provenance[0]
  const { amount, notes, fee } = event[2].Request
  return presentRequest({ origin, event: event[2], stateDirection, eventTimestamp, counterpartyId, amount, notes, fees: fee })
}

function presentPendingOffer (transaction) {
  console.log('PRESENT PENDING OFFER : ', transaction)

  const { event, provenance } = transaction
  const origin = event[0]
  const stateDirection = DIRECTION.incoming // this indicates the spender of funds. (Note: This is an actionable Tx.)
  const eventTimestamp = event[1]
  const counterpartyId = provenance[0]
  const { amount, notes, fee } = event[2].Promise.tx
  return presentOffer({ origin, event: event[2], stateDirection, eventTimestamp, counterpartyId, amount, notes, fees: fee })
}

function presentTransaction (transaction) {
  const { state, origin, event, timestamp, adjustment, available } = transaction
  const stateStage = state.split('/')[1]
  const stateDirection = state.split('/')[0] // NOTE: This returns either 'incoming' or 'outgoing,' wherein, 'incoming' indicates the recipient of funds, 'outgoing' indicates the spender of funds.
  const parsedAdjustment = adjustment.Ok

  switch (stateStage) {
    case 'completed': {
      if (event.Receipt) return presentReceipt({ origin, event, stateDirection, eventTimestamp: timestamp.event, fees: parsedAdjustment.fees, presentBalance: available })
      if (event.Cheque) return presentCheque({ origin, event, stateDirection, eventTimestamp: timestamp.event, fees: parsedAdjustment.fees, presentBalance: available })
      throw new Error('Completed event did not have a Receipt or Cheque event')
    }

    // case 'declined': {
    //   // We have decided to show this **only** in the inbox page via the recent transactions filter
    //   if (event.Request) return presentRequest({ origin, event, stateDirection, eventTimestamp: timestamp.event, fees: parsedAdjustment.fees, status: STATUS.rejected })
    //   if (event.Promise) return presentOffer({ origin, event, stateDirection, eventTimestamp: timestamp.event, fees: parsedAdjustment.fees, status: STATUS.rejected })
    //   throw new Error('Rejected event did not have a Request or Promise event')
    // }

    case 'canceled': {
      if (event.Cancel.entry.Request) return presentRequest({ origin, event: event.Cancel.entry, stateDirection, eventTimestamp: timestamp.event, fees: parsedAdjustment.fees, status: STATUS.canceled, reason: event.Cancel.reason })
      if (event.Cancel.entry.Promise) return presentOffer({ origin, event: event.Cancel.entry, stateDirection, eventTimestamp: timestamp.event, fees: parsedAdjustment.fees, status: STATUS.canceled, reason: event.Cancel.reason })
      throw new Error('Canceled event did not have a Request or Promise event')
    }
    /* **************************  NOTE: ********************************** */
    /* The below two cases are 'waitingTransaction' cases. */
    case 'requested': {
      return presentRequest({ origin, event, stateDirection, eventTimestamp: timestamp.event, fees: parsedAdjustment.fees })
    }
    /* 'approved' only indicates that a payment was offered (could be in response to a request or an isolate payment) */
    case 'approved': {
      return presentOffer({ origin, event, stateDirection, eventTimestamp: timestamp.event, fees: parsedAdjustment.fees })
    }
    default:
      throw new Error('Error: No transaction stateStage was matched. Current transaction stateStage : ', stateStage)
  }
}

const HoloFuelDnaInterface = {
  user: {
    get: async () => {
      const result = await createZomeCall('transactions/whoami')()
      if (result.Err) return console.error('There was an error locating the current holofuel agent nickname. ERROR: ', result.Err)
      return {
        id: result.agent_id.pub_sign_key,
        nickname: result.agent_id.nick
      }
    },
    getCounterparty: async ({ agentId }) => {
      const result = await createZomeCall('transactions/whois')({ agents: agentId })
      if (result.Err || !result[0].Ok) {
        console.error('There was an error locating the current holofuel agent nickname. ERROR: ', result.Err || result[0].Err)
        return {
          id: agentId,
          error: true
        }
      }

      return {
        id: result[0].Ok.agent_id.pub_sign_key,
        nickname: result[0].Ok.agent_id.nick
      }
    }
  },
  ledger: {
    get: async () => {
      const { balance, credit, payable, receivable, fees } = await createZomeCall('transactions/ledger_state')()
      return {
        balance,
        credit,
        payable,
        receivable,
        fees
      }
    }
  },
  transactions: {
    allCompleted: async () => {
      const { transactions } = await createZomeCall('transactions/list_transactions')()
      const listOfNonActionableTransactions = transactions.map(presentTransaction)
      const noDuplicateIds = _.uniqBy(listOfNonActionableTransactions, 'id')

      console.log('ALL COMPLETED TRANSACTIONS : ', noDuplicateIds.filter(tx => tx.status === 'completed').sort((a, b) => a.timestamp < b.timestamp ? -1 : 1).reverse())

      return noDuplicateIds.filter(tx => tx.status === 'completed').sort((a, b) => a.timestamp > b.timestamp ? -1 : 1)
    },
    allActionable: async () => {
      const { requests, promises } = await createZomeCall('transactions/list_pending')()
      const actionableTransactions = requests.map(presentPendingRequest).concat(promises.map(presentPendingOffer))

      console.log('ALL ACTIONABLE TRANSACTIONS : ', actionableTransactions.sort((a, b) => a.timestamp > b.timestamp ? -1 : 1))

      return actionableTransactions.sort((a, b) => a.timestamp > b.timestamp ? -1 : 1)
    },
    allWaiting: async () => {
      const { transactions } = await createZomeCall('transactions/list_transactions')()
      const listOfNonActionableTransactions = transactions.map(presentTransaction)
      /* NOTE: Filtering out duplicate IDs should prevent an already completed tranaction from displaying as a pending tranaction if any lag occurs in data update layer.  */
      const noDuplicateIds = _.uniqBy(listOfNonActionableTransactions, 'id')
      return noDuplicateIds.filter(tx => tx.status === 'pending').sort((a, b) => a.timestamp > b.timestamp ? -1 : 1)
    },
    allEarnings: () => mockEarningsData,
    allNonActionableByState: async (transactionId, stateFilter = []) => {
      const filteredList = await createZomeCall('transactions/list_transactions')({ state: stateFilter })
      const cleanedList = _.uniqBy(filteredList, 'id').filter(tx => tx.status === 'completed').sort((a, b) => a.timestamp > b.timestamp ? -1 : 1)
      if (cleanedList.length === 0) {
        console.error(`No pending transaction with id ${transactionId} found.`)
      } else {
        return cleanedList
      }
    },
    /* NOTE: allNonPending will include Declined and Canceled Transactions:  */
    allNonPending: async () => {
      const { transactions } = await createZomeCall('transactions/list_transactions')()
      const listOfNonActionableTransactions = transactions.map(presentTransaction)
      const noDuplicateIds = _.uniqBy(listOfNonActionableTransactions, 'id')

      console.log('ALL NOT_PENDING TRANSACTIONS : ', noDuplicateIds.filter(tx => tx.status !== 'pending').sort((a, b) => a.timestamp < b.timestamp ? -1 : 1))

      return noDuplicateIds.filter(tx => tx.status !== 'pending').sort((a, b) => a.timestamp > b.timestamp ? -1 : 1)
    },
    getPending: async (transactionId) => {
      const { requests, promises } = await createZomeCall('transactions/list_pending')({ origins: transactionId })
      const transactionArray = requests.map(presentPendingRequest).concat(promises.map(presentPendingOffer))
      if (transactionArray.length === 0) {
        throw new Error(`no pending transaction with id ${transactionId} found.`)
      } else {
        return transactionArray[0]
      }
    },
    /* NOTE: This is to allow handling of the other side of the transaction that was canceled... ( ?? - verify - ).  */
    getPendingCanceled: async (transactionId) => {
      const canceledResult = await createZomeCall('transactions/list_pending_canceled')({ origins: transactionId })
      console.log(' >>>>>>>>>> Pending Canceled transactions : ', canceledResult)

      const transactionArray = canceledResult.map(canceledTx => canceledTx.entry)
      if (transactionArray.length === 0) {
        throw new Error(`no pending transaction with id ${transactionId} found.`)
      } else {
        return transactionArray[0]
      }
    },
    /* NOTE: This is to allow handling of the other side of the transaction that was declined.  */
    getPendingDeclined: async (transactionId) => {
      const declinedResult = await createZomeCall('transactions/list_pending_declined')({ origins: transactionId })
      console.log(' >>>>>>>>>> Pendng Declined transactions RESULT : ', declinedResult)

      const transactionArray = declinedResult.map(declinedTx => declinedTx.entry)
      if (transactionArray.length === 0) {
        throw new Error(`no pending transaction with id ${transactionId} found.`)
      } else {
        return transactionArray[0]
      }
    },
    /* NOTE: decline ACTIONABLE TRANSACTION (NB: pending transaction proposed by another agent) >> ONLY for on asynchronous transactions. */
    decline: async (transactionId) => {
      const transaction = await HoloFuelDnaInterface.transactions.getPending(transactionId)
      const reason = annulTransactionReaason
      const declinedProof = await createZomeCall('transactions/decline_pending')({ origins: transactionId, reason })

      return {
        ...transaction,
        id: transactionId,
        status: STATUS.declined,
        declinedReference: declinedProof
      }
    },
    /* NOTE: cancel WAITING TRANSACTION that current agent authored (or ACTIONABLE ACCEPT that agent received... ???). */
    cancel: async (transactionId) => {
      console.log('TRANSACTION TO CANCEL (by ID) : ', transactionId)

      const authoredRequests = await HoloFuelDnaInterface.transactions.allNonActionableByState(transactionId, ['incoming/request'])

      console.log(' AUTHORED TRANSACTIONS : ', authoredRequests)
      const transaction = authoredRequests.find(authoredRequest => authoredRequest.id === transactionId)

      console.log(' CANCEL TRANSACTION DETAILS : ', transaction)
      const reason = annulTransactionReaason
      await createZomeCall('transactions/cancel_transactions')({ origins: transactionId, reason })
      return {
        ...transaction,
        id: transactionId,
        status: STATUS['pending-cancelation']
      }
    }
  },
  /* NOTE: recover funds from DECLINED PENDING TRANSACTION (ie: Counterparty declined offer) - intended for REFUNDS  */
  recoverFunds: async (transactionId) => {
    const reason = annulTransactionReaason
    const transaction = await HoloFuelDnaInterface.transactions.getPendingDeclined(transactionId)

    console.log('confirm - TRANSACTION TO CANCEL : ', transaction)

    const canceledProof = await createZomeCall('transactions/cancel')({ entry: transaction, reason })
    return {
      ...transaction,
      id: transactionId,
      status: STATUS.canceled,
      canceledReference: canceledProof
    }
  },
  requests: {
    create: async (counterpartyId, amount, notes) => {
      console.log('transaction notes : ', notes)

      const origin = await createZomeCall('transactions/request')({ from: counterpartyId, amount: amount.toString(), deadline: MOCK_DEADLINE, notes })
      return {
        id: origin,
        amount,
        counterparty: {
          id: counterpartyId
        },
        notes,
        direction: DIRECTION.incoming, // this indicates the hf recipient
        status: STATUS.pending,
        type: TYPE.request,
        timestamp: currentDataTimeIso
      }
    }
  },
  offers: {
    create: async (counterpartyId, amount, notes, requestId) => {
      console.log('transaction notes : ', notes)

      const origin = await createZomeCall('transactions/promise')(pickBy(i => i, { to: counterpartyId, amount: amount.toString(), deadline: MOCK_DEADLINE, notes, request: requestId }))

      return {
        id: requestId || origin, // NB: If requestId isn't defined, then offer use origin as the ID (ie. Offer is the initiating transaction).
        amount,
        counterparty: {
          id: counterpartyId
        },
        notes,
        direction: DIRECTION.outgoing, // this indicates the hf spender
        status: STATUS.pending,
        type: TYPE.offer,
        timestamp: currentDataTimeIso
      }
    },

    accept: async (transactionId) => {
      console.log('ACCEPT transactionId : ', transactionId)

      const transaction = await HoloFuelDnaInterface.transactions.getPending(transactionId)
      console.log('ACCEPT transaction : ', transaction)
      const result = await createZomeCall('transactions/receive_payments_pending')({ promises: transactionId })

      const acceptedPaymentHash = Object.entries(result)[0][1]
      if (acceptedPaymentHash.Err) throw new Error('There was an error accepting the payment for the referenced transaction. ERROR: ', acceptedPaymentHash.Err)

      return {
        ...transaction,
        id: transactionId, // should always match `Object.entries(result)[0][0]`
        direction: DIRECTION.incoming, // this indicates the hf recipient
        status: STATUS.completed,
        type: TYPE.offer
      }
    },

    acceptMany: async (transactionIdArray) => {
      const result = await createZomeCall('transactions/receive_payments_pending')({ promises: transactionIdArray })
      const transactionArray = Object.entries(result).map(presentAcceptedPayment)
      return transactionArray.sort((a, b) => a.timestamp < b.timestamp ? -1 : 1).reverse()
    },

    acceptAll: async () => {
      const result = await createZomeCall('transactions/receive_payments_pending')({})
      const transactionArray = Object.entries(result).map(presentAcceptedPayment)
      return transactionArray.sort((a, b) => a.timestamp < b.timestamp ? -1 : 1).reverse()
    }
  }
}

export default HoloFuelDnaInterface
