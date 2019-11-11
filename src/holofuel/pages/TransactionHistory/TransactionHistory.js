import React, { useState } from 'react'
import cx from 'classnames'
import { useQuery, useMutation } from '@apollo/react-hooks'
import { isEmpty, flatten, capitalize } from 'lodash/fp'
import './TransactionHistory.module.css'
import PrimaryLayout from 'holofuel/components/layout/PrimaryLayout'
import Button from 'holofuel/components/Button'
import Modal from 'holofuel/components/Modal'
import CopyAgentId from 'holofuel/components/CopyAgentId'
import HolofuelWaitingTransactionsQuery from 'graphql/HolofuelWaitingTransactionsQuery.gql'
import HolofuelCompletedTransactionsQuery from 'graphql/HolofuelCompletedTransactionsQuery.gql'
import HolofuelHistoryCounterpartiesQuery from 'graphql/HolofuelHistoryCounterpartiesQuery.gql'
import HolofuelLedgerQuery from 'graphql/HolofuelLedgerQuery.gql'
import HolofuelCancelMutation from 'graphql/HolofuelCancelMutation.gql'
import { presentAgentId, presentHolofuelAmount, presentDateAndTime } from 'utils'
import { DIRECTION } from 'models/Transaction'

// Data - Mutation hook with refetch:
function useCancel () {
  const [cancel] = useMutation(HolofuelCancelMutation)
  return (id) => cancel({
    variables: { transactionId: id },
    refetchQueries: [{
      query: HolofuelCompletedTransactionsQuery
    }, {
      query: HolofuelWaitingTransactionsQuery
    }]
  })
}

function useFetchCounterparties () {
  const { data: { holofuelCompletedTransactions = [] } = {} } = useQuery(HolofuelCompletedTransactionsQuery)
  const { data: { holofuelWaitingTransactions = [] } = {} } = useQuery(HolofuelWaitingTransactionsQuery)
  const { data: { holofuelHistoryCounterparties } = {}, client } = useQuery(HolofuelHistoryCounterpartiesQuery)

  if (holofuelHistoryCounterparties) {
    const filterTransactionsByAgentId = (agent, txListType) => txListType.filter(transaction => transaction.counterparty.id === agent.id)
    const updateTxListCounterparties = (txListType, counterpartyList) => counterpartyList.map(agent => {
      const matchingTx = filterTransactionsByAgentId(agent, txListType)
      return matchingTx.map(transaction => { Object.assign(transaction.counterparty, agent); return transaction })
    })

    // Cache Write/Update for HolofuelCompletedTransactionsQuery
    const newCompletedTxList = flatten(updateTxListCounterparties(holofuelCompletedTransactions, holofuelHistoryCounterparties))
    client.writeQuery({
      query: HolofuelCompletedTransactionsQuery,
      data: {
        holofuelCompletedTransactions: newCompletedTxList
      }
    })

    // Cache Write/Update for HolofuelWaitingTransactionsQuery
    const newWaitingTxList = flatten(updateTxListCounterparties(holofuelWaitingTransactions, holofuelHistoryCounterparties))
    client.writeQuery({
      query: HolofuelWaitingTransactionsQuery,
      data: {
        holofuelWaitingTransactions: newWaitingTxList
      }
    })
  }
}

const FILTER_TYPES = ['all', 'withdrawals', 'deposits', 'pending']

// Display - Functional Components with Hooks :
export default function TransactionsHistory () {
  const { data: { holofuelLedger: { balance } = { balance: 0 } } = {} } = useQuery(HolofuelLedgerQuery)
  const { data: { holofuelCompletedTransactions: completedTransactions = [] } = {} } = useQuery(HolofuelCompletedTransactionsQuery)
  const { data: { holofuelWaitingTransactions: pendingTransactions = [] } = {} } = useQuery(HolofuelWaitingTransactionsQuery)
  useFetchCounterparties()

  const cancelTransaction = useCancel()

  const [modalTransaction, setModalTransaction] = useState()
  const showCancellationModal = transaction => setModalTransaction(transaction)

  const columnHeadings = [
    null,
    null,
    'Fees',
    'Amount',
    null
  ]

  const [filter, setFilter] = useState(FILTER_TYPES[0])

  let filteredPendingTransactions = []
  let filteredCompletedTransactions = []
  let transactionTypeName = ''

  switch (filter) {
    case 'all':
      filteredPendingTransactions = pendingTransactions
      filteredCompletedTransactions = completedTransactions
      transactionTypeName = 'transactions'
      break
    case 'withdrawals':
      filteredPendingTransactions = []
      filteredCompletedTransactions = completedTransactions.filter(transaction => transaction.direction === DIRECTION.outgoing)
      transactionTypeName = 'withdrawals'
      break
    case 'deposits':
      filteredPendingTransactions = []
      filteredCompletedTransactions = completedTransactions.filter(transaction => transaction.direction === DIRECTION.incoming)
      transactionTypeName = 'deposits'
      break
    case 'pending':
      filteredPendingTransactions = pendingTransactions
      filteredCompletedTransactions = []
      transactionTypeName = 'pending transactions'
      break
    default:
      throw new Error(`unrecognized filter type: "${filter}"`)
  }

  const noVisibleTransactions = isEmpty(filteredPendingTransactions) && isEmpty(filteredCompletedTransactions)

  return <PrimaryLayout headerProps={{ title: 'History' }}>
    <div styleName='balance'>
      <div styleName='balance-label'>Available Balance</div>
      <div styleName='balance-amount'>{presentHolofuelAmount(balance)} HF</div>
    </div>
    <FilterButtons filter={filter} setFilter={setFilter} />

    {noVisibleTransactions && <div styleName='transactions-empty'>
      You have no {transactionTypeName}.
    </div>}

    <section styleName='account-ledger-table'>
      {!noVisibleTransactions && <table styleName='completed-transactions-table'>
        <thead>
          <tr key='heading'>
            {columnHeadings.map((header, contentIndex) => <TransactionTableHeading
              key={`heading-${contentIndex}`}
              content={header}
            />)}
          </tr>
        </thead>
        <tbody>
          {!isEmpty(filteredPendingTransactions) && filteredPendingTransactions.map(pendingTx => {
            return <TransactionRow
              transaction={pendingTx}
              key={pendingTx.id}
              showCancellationModal={showCancellationModal}
            />
          })}

          {!isEmpty(filteredCompletedTransactions) && filteredCompletedTransactions.map(completeTx => {
            return <TransactionRow
              transaction={completeTx}
              key={completeTx.id}
              showCancellationModal={showCancellationModal}
              completed />
          })}
        </tbody>
      </table>}
    </section>

    <ConfirmCancellationModal
      handleClose={() => setModalTransaction(null)}
      transaction={modalTransaction}
      cancelTransaction={cancelTransaction} />
  </PrimaryLayout>
}

function FilterButtons ({ filter, setFilter }) {
  const capitalizeFirstLetter = string => string.charAt(0).toUpperCase() + string.slice(1)

  return <div styleName='filter-buttons'>
    {FILTER_TYPES.map(type => <div
      styleName={cx('filter-button', { selected: type === filter })}
      onClick={() => setFilter(type)}
      key={type}>
      {capitalizeFirstLetter(type)}
    </div>)}
  </div>
}

function TransactionTableHeading ({ content }) {
  return <th id={content ? content.toLowerCase() : null} styleName='completed-tx-col table-headers'>
    {content}
  </th>
}

export function TransactionRow ({ transaction, showCancellationModal, completed }) {
  const { id, timestamp, amount, counterparty, direction, fees, presentBalance, notes } = transaction

  const { date, time } = presentDateAndTime(timestamp)
  return <tr key={id} styleName={cx('table-content-row', { 'pending-transaction': !completed })} data-testid='transactions-table-row'>
    <td styleName='completed-tx-col table-content'>
      <p data-testid='cell-date'>{date}</p>
      <p data-testid='cell-time'>{time}</p>
    </td>
    <td styleName='completed-tx-col table-content align-left'>
      <h4 data-testid='cell-counterparty'>
        <CopyAgentId agent={counterparty}>
          {counterparty.nickname || presentAgentId(counterparty.id)}
        </CopyAgentId>
      </h4>
      <p styleName='italic' data-testid='cell-notes'>{notes || 'none'}</p>
    </td>
    <td styleName={cx('completed-tx-col table-content', { 'red-text': fees !== 0 })} data-testid='cell-fees'>{fees}</td>
    <AmountCell amount={amount} direction={direction} />
    { completed
      ? <td styleName='completed-tx-col table-content' data-testid='cell-present-balance'>{presentBalance}</td>
      : <td styleName='completed-tx-col table-content' data-testid='cell-pending-item'>
        <p styleName='italic'>Pending</p>
        <CancelButton transaction={transaction} showCancellationModal={showCancellationModal} />
      </td>
    }
  </tr>
}

function AmountCell ({ amount, direction }) {
  const amountDisplay = direction === 'outgoing' ? `(${presentHolofuelAmount(amount)})` : presentHolofuelAmount(amount)
  return <td
    styleName={cx('completed-tx-col table-content', { 'red-text': direction === 'outgoing' }, { 'green-text': direction === 'incoming' })}
    data-testid='cell-amount'>
    {amountDisplay}
  </td>
}

function CancelButton ({ showCancellationModal, transaction }) {
  return <Button
    onClick={() => showCancellationModal(transaction)}
    styleName='cancel-button'>
    Cancel
  </Button>
}

// NOTE: Check to see if/agree as to whether we can abstract out the below modal component
export function ConfirmCancellationModal ({ transaction, handleClose, cancelTransaction }) {
  if (!transaction) return null
  const { id, counterparty, amount, type, direction } = transaction
  const onYes = () => {
    cancelTransaction(id)
    handleClose()
  }
  return <Modal
    contentLabel={`Cancel ${type}?`}
    isOpen={!!transaction}
    handleClose={handleClose}
    styleName='modal'>
    <div styleName='modal-title'>Are you sure?</div>
    <div styleName='modal-text' role='heading'>
      Cancel your {capitalize(type)} {direction === 'incoming' ? 'for' : 'of'} <span styleName='modal-amount' data-testid='modal-amount'>{presentHolofuelAmount(amount)} HF</span> {direction === 'incoming' ? 'from' : 'to'} <span styleName='modal-counterparty' testid='modal-counterparty'> {counterparty.nickname || presentAgentId(counterparty.id)}</span> ?
    </div>
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
