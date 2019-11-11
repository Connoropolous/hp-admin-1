import React, { useState } from 'react'
import cx from 'classnames'
import { isEmpty, flatten, groupBy } from 'lodash/fp'
import { useQuery, useMutation } from '@apollo/react-hooks'
import HolofuelLedgerQuery from 'graphql/HolofuelLedgerQuery.gql'
import HolofuelInboxCounterpartiesQuery from 'graphql/HolofuelInboxCounterpartiesQuery.gql'
import HolofuelActionableTransactionsQuery from 'graphql/HolofuelActionableTransactionsQuery.gql'
import HolofuelCompletedTransactionsQuery from 'graphql/HolofuelCompletedTransactionsQuery.gql'
// import HolofuelRecentTransactionsQuery from 'graphql/HolofuelRecentTransactionsQuery.gql'
import HolofuelAcceptOfferMutation from 'graphql/HolofuelAcceptOfferMutation.gql'
import HolofuelOfferMutation from 'graphql/HolofuelOfferMutation.gql'
import HolofuelDeclineMutation from 'graphql/HolofuelDeclineMutation.gql'
import { TYPE } from 'models/Transaction'
import PrimaryLayout from 'holofuel/components/layout/PrimaryLayout'
import CopyAgentId from 'holofuel/components/CopyAgentId'
import Button from 'holofuel/components/Button'
import Modal from 'holofuel/components/Modal'
import Jumbotron from 'holofuel/components/Jumbotron'
import PageDivider from 'holofuel/components/PageDivider'
import HashAvatar from 'components/HashAvatar'
import AddIcon from 'components/icons/AddIcon'
import './Inbox.module.css'
import { presentAgentId, presentHolofuelAmount, presentDateAndTime } from 'utils'

function useOffer () {
  const [offer] = useMutation(HolofuelOfferMutation)
  return ({ id, amount, counterparty }) => offer({
    variables: { amount, counterpartyId: counterparty.id, requestId: id },
    refetchQueries: [{
      query: HolofuelActionableTransactionsQuery
    }]
  })
}

function useDecline () {
  const [decline] = useMutation(HolofuelDeclineMutation)
  return ({ id }) => decline({
    variables: { transactionId: id },
    refetchQueries: [{
      query: HolofuelActionableTransactionsQuery
    }]
  })
}

function useFetchCounterparties () {
  const { data: { holofuelActionableTransactions = [] } = {} } = useQuery(HolofuelActionableTransactionsQuery)
  const { data: { holofuelInboxCounterparties } = {}, client } = useQuery(HolofuelInboxCounterpartiesQuery)

  if (holofuelInboxCounterparties) {
    const filterTransactionsByAgentId = (agent, txListType) => txListType.filter(transaction => transaction.counterparty.id === agent.id)
    const updateTxListCounterparties = (txListType, counterpartyList) => counterpartyList.map(agent => {
      const matchingTx = filterTransactionsByAgentId(agent, txListType)
      return matchingTx.map(transaction => { Object.assign(transaction.counterparty, agent); return transaction })
    })

    const result = flatten(updateTxListCounterparties(holofuelActionableTransactions, holofuelInboxCounterparties))

    client.writeQuery({
      query: HolofuelActionableTransactionsQuery,
      data: {
        holofuelActionableTransactions: result
      }
    })
  }
}

export default function Inbox () {
  const { data: { holofuelLedger: { balance: holofuelBalance } = { balance: 0 } } = {} } = useQuery(HolofuelLedgerQuery)
  const { data: { holofuelActionableTransactions: actionableTransactions = [] } = {} } = useQuery(HolofuelActionableTransactionsQuery)

  // const { data: { holofuelRecentTransactions: recentTransactions = [] } = {} } = useQuery(HolofuelRecentTransactionsQuery)
  const { data: { holofuelCompletedTransactions: recentTransactions = [] } = {} } = useQuery(HolofuelCompletedTransactionsQuery)

  const VIEW = {
    pending: 'pending',
    recent: 'recent'
  }
  const toggleButtons = [{ view: 'pending', label: 'Pending' }, { view: 'recent', label: 'Recent' }]
  const [inboxView, setInboxView] = useState(VIEW.pending)
  let displayTransactions = []
  switch (inboxView) {
    case VIEW.pending:
      displayTransactions = actionableTransactions
      break
    case VIEW.recent:
      displayTransactions = recentTransactions
      break
    default:
      displayTransactions = actionableTransactions
      break
  }

  useFetchCounterparties()
  const payTransaction = useOffer()
  const declineTransaction = useDecline()
  const [modalTransaction, setModalTransaction] = useState()
  const isPendingTransactionsEmpty = isEmpty(actionableTransactions)
  const isDisplayTransactionsEmpty = isEmpty(displayTransactions)

  const pageTitle = `Inbox${isPendingTransactionsEmpty ? '' : ` (${actionableTransactions.length})`}`

  const showConfirmationModal = (transaction, action) => {
    const modalTransaction = { ...transaction, action }
    setModalTransaction(modalTransaction)
  }

  const transactionsByDate = groupBy('dateLabel', displayTransactions)
  console.log('transactionsByDate : ', transactionsByDate)

  return <PrimaryLayout headerProps={{ title: pageTitle }} inboxCount={actionableTransactions.length}>
    <Jumbotron
      className='inbox-header'
      title={`${presentHolofuelAmount(holofuelBalance)} HF`}
      titleSuperscript='Balance'isTransactionsEmpty
    >
      <Button
        styleName='new-transaction-button'
      >
        <AddIcon styleName='add-icon' color='#0DC39F' />
        <h3 styleName='button-text'>New Transaction</h3>
      </Button>

      <div>
        {toggleButtons.map(button =>
          <Button
            variant={button.view === inboxView ? 'toggle-selected' : 'toggle'}
            onClick={() => setInboxView(VIEW[button.view])}
            className={cx(`${button.view}-button`)} /* eslint-disable-line quote-props */
            key={button.days}>
            {button.label}
          </Button>)}
      </div>
    </Jumbotron>
    <PageDivider title='Today' />

    {!isDisplayTransactionsEmpty && <div styleName='transaction-list'>
      {displayTransactions.map(transaction => <TransactionRow
        transaction={transaction}
        showConfirmationModal={showConfirmationModal}
        role='list'
        key={transaction.id} />)}
    </div>}

    <ConfirmationModal
      handleClose={() => setModalTransaction(null)}
      transaction={modalTransaction}
      payTransaction={payTransaction}
      declineTransaction={declineTransaction} />
  </PrimaryLayout>
}

export function TransactionRow ({ transaction, showConfirmationModal }) {
  const { counterparty, amount, type, notes } = transaction // timestamp

  const isOffer = type === TYPE.offer
  const isRequest = !isOffer

  // const { date, time } = presentDateAndTime(timestamp)

  const story = isOffer ? ' is offering' : ' is requesting'

  return <div styleName='transaction-row' role='listitem'>
    <div styleName='date-time'>
      {/* <div styleName='date'>
        {date}
      </div>
      <div styleName='time'>
        {time}
      </div> */}
      <CopyAgentId agent={counterparty}>
        <HashAvatar seed={counterparty.id} size={32} data-testid='hash-icon' />
      </CopyAgentId>
    </div>
    <div styleName='description-cell'>
      <div styleName='story'><span styleName='counterparty'>
        <CopyAgentId agent={counterparty}>
          {counterparty.nickname || presentAgentId(counterparty.id)}
        </CopyAgentId>
      </span>{story}</div>
      <div styleName='notes'>{notes}</div>
    </div>
    <AmountCell amount={amount} isRequest={isRequest} />

    <div styleName='actions'>
      {isOffer && <AcceptButton transaction={transaction} />}
      {isRequest && <PayButton transaction={transaction} showConfirmationModal={showConfirmationModal} />}
      <RejectButton transaction={transaction} showConfirmationModal={showConfirmationModal} />
    </div>
  </div>
}

function AmountCell ({ amount, isRequest }) {
  const amountDisplay = isRequest ? `(${presentHolofuelAmount(amount)})` : presentHolofuelAmount(amount)
  return <div styleName={cx('amount', { debit: isRequest })}>{amountDisplay}</div>
}

// these are pulled out into custom hooks ready for if we need to move them to their own file for re-use elsewhere
function useAcceptOffer (id) {
  const [acceptOffer] = useMutation(HolofuelAcceptOfferMutation)
  return () => acceptOffer({
    variables: { transactionId: id },
    refetchQueries: [{
      query: HolofuelActionableTransactionsQuery
    }]
  })
}

function AcceptButton ({ transaction: { id } }) {
  const acceptOffer = useAcceptOffer(id)
  return <Button
    onClick={acceptOffer}
    styleName='accept-button'>
    Accept
  </Button>
}

function PayButton ({ showConfirmationModal, transaction }) {
  const action = 'pay'
  return <Button
    onClick={() => showConfirmationModal(transaction, action)}
    styleName='pay-button'>
    Pay
  </Button>
}

function RejectButton ({ showConfirmationModal, transaction }) {
  const action = 'decline'
  return <Button
    onClick={() => showConfirmationModal(transaction, action)}
    styleName='reject-button'>
    Reject
  </Button>
}

export function ConfirmationModal ({ transaction, handleClose, declineTransaction, payTransaction }) {
  if (!transaction) return null
  const { id, counterparty, amount, type, action } = transaction

  let message, actionHook, actionParams, contentLabel
  switch (action) {
    case 'pay': {
      contentLabel = 'Pay request'
      actionParams = { id, amount, counterparty }
      actionHook = payTransaction
      message = <div styleName='modal-text' data-testid='modal-message'>Pay <span styleName='counterparty'> {counterparty.nickname || presentAgentId(counterparty.id)}</span> <span styleName='modal-amount'>{presentHolofuelAmount(amount)} HF</span>?</div>
      break
    }
    case 'decline': {
      contentLabel = `Reject ${type}?`
      actionParams = id
      actionHook = declineTransaction
      message = <div styleName='modal-text' data-testid='modal-message'>Reject <span styleName='counterparty'> {counterparty.nickname || presentAgentId(counterparty.id)}</span>'s {type} of <span styleName='modal-amount'>{presentHolofuelAmount(amount)} HF</span>?</div>
      break
    }
    default:
      throw new Error('Error: Transaction action was not matched with a modal action. Current transaction action : ', action)
  }

  const onYes = () => {
    actionHook(actionParams)
    handleClose()
  }

  return <Modal
    contentLabel={contentLabel}
    isOpen={!!transaction}
    handleClose={handleClose}
    styleName='modal'>
    <div styleName='modal-title'>Are you sure?</div>
    {message}
    <div styleName='modal-buttons'>
      <Button
        onClick={handleClose}
        styleName='modal-button-no'>
        No
      </Button>
      <Button
        onClick={onYes}
        styleName='modal-button-yes'>
        Yes
      </Button>
    </div>
  </Modal>
}
