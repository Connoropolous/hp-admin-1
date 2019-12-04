import React, { useState } from 'react'
import cx from 'classnames'
import { useQuery, useMutation } from '@apollo/react-hooks'
import { isEmpty, capitalize, uniqBy } from 'lodash/fp'
import PrimaryLayout from 'holofuel/components/layout/PrimaryLayout'
import Button from 'holofuel/components/Button'
import Modal from 'holofuel/components/Modal'
import CopyAgentId from 'holofuel/components/CopyAgentId'
import HolofuelWaitingTransactionsQuery from 'graphql/HolofuelWaitingTransactionsQuery.gql'
import HolofuelCompletedTransactionsQuery from 'graphql/HolofuelCompletedTransactionsQuery.gql'
import HolofuelHistoryCounterpartiesQuery from 'graphql/HolofuelHistoryCounterpartiesQuery.gql'
import HolofuelUserQuery from 'graphql/HolofuelUserQuery.gql'
import HolofuelLedgerQuery from 'graphql/HolofuelLedgerQuery.gql'
import HolofuelCancelMutation from 'graphql/HolofuelCancelMutation.gql'
import { presentAgentId, presentHolofuelAmount, partitionByDate } from 'utils'
import { DIRECTION, STATUS } from 'models/Transaction'
import './TransactionHistory.module.css'
import HashAvatar from '../../../components/HashAvatar/HashAvatar'

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

function useTransactionsWithCounterparties () {
  const { data: { holofuelUser: whoami = {} } = {} } = useQuery(HolofuelUserQuery)
  const { data: { holofuelHistoryCounterparties = [] } = {} } = useQuery(HolofuelHistoryCounterpartiesQuery)
  const { data: { holofuelCompletedTransactions = [] } = {} } = useQuery(HolofuelCompletedTransactionsQuery, { fetchPolicy: 'network-only' })
  const { data: { holofuelWaitingTransactions = [] } = {} } = useQuery(HolofuelWaitingTransactionsQuery, { fetchPolicy: 'network-only' })

  const updateCounterparties = (transactions, counterparties) => transactions.map(transaction => ({
    ...transaction,
    counterparty: counterparties.find(counterparty => counterparty.id === transaction.counterparty.id) || transaction.counterparty
  }))

  const allCounterparties = uniqBy('id', holofuelHistoryCounterparties.concat([whoami]))

  const updatedCompletedTransactions = updateCounterparties(holofuelCompletedTransactions, allCounterparties)
  const updatedWaitingTransactions = updateCounterparties(holofuelWaitingTransactions, allCounterparties)

  return {
    completedTransactions: updatedCompletedTransactions,
    pendingTransactions: updatedWaitingTransactions
  }
}

const FILTER_TYPES = ['all', 'withdrawals', 'deposits', 'pending']

export default function TransactionsHistory () {
  const { data: { holofuelLedger: { balance } = { balance: 0 } } = {} } = useQuery(HolofuelLedgerQuery)
  const { completedTransactions, pendingTransactions } = useTransactionsWithCounterparties()

  const cancelTransaction = useCancel()

  const [modalTransaction, setModalTransaction] = useState()
  const showCancellationModal = transaction => setModalTransaction(transaction)

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

  const partitionedTransactions = ([{
    label: 'Pending',
    transactions: filteredPendingTransactions
  }].concat(partitionByDate(filteredCompletedTransactions)))
    .filter(({ transactions }) => !isEmpty(transactions))

  return <PrimaryLayout headerProps={{ title: 'History' }}>
    <div styleName='balance'>
      <div styleName='balance-label'>Available Balance</div>
      <div styleName='balance-amount'>{presentHolofuelAmount(balance)} HF</div>
    </div>
    <FilterButtons filter={filter} setFilter={setFilter} />

    {noVisibleTransactions && <div styleName='transactions-empty'>
      You have no {transactionTypeName}.
    </div>}

    {!noVisibleTransactions && <div styleName='transactions'>
      {partitionedTransactions.map(({ label, transactions }) => <React.Fragment key={label}>
        <div styleName='partition-label'>{label}</div>
        {transactions.map((transaction, index) => <TransactionRow
          transaction={transaction}
          key={transaction.id}
          showCancellationModal={showCancellationModal}
          isFirst={index === 0} />)}
      </React.Fragment>)}
    </div>}

    <ConfirmCancellationModal
      handleClose={() => setModalTransaction(null)}
      transaction={modalTransaction}
      cancelTransaction={cancelTransaction} />
  </PrimaryLayout>
}

function FilterButtons ({ filter, setFilter }) {
  const capitalizeFirstLetter = string => string.charAt(0).toUpperCase() + string.slice(1)

  return <div styleName='filter-buttons' data-testid='filter-buttons'>
    {FILTER_TYPES.map(type => <div
      styleName={cx('filter-button', { selected: type === filter })}
      onClick={() => setFilter(type)}
      key={type}>
      {capitalizeFirstLetter(type)}
    </div>)}
  </div>
}

export function TransactionRow ({ transaction, showCancellationModal, isFirst }) {
  const { amount, counterparty, direction, presentBalance, notes, status } = transaction
  const pending = status === STATUS.pending

  const presentedAmount = direction === DIRECTION.incoming
    ? `+ ${presentHolofuelAmount(amount)}`
    : `- ${presentHolofuelAmount(amount)}`

  return <div styleName={cx('transaction-row', { 'not-first-row': !isFirst })} data-testid='transaction-row'>
    <div styleName='avatar'>
      <CopyAgentId agent={counterparty}>
        <HashAvatar seed={counterparty.id} size={32} />
      </CopyAgentId>
    </div>
    <div styleName='name-and-notes'>
      <div styleName='name'>
        <CopyAgentId agent={counterparty}>
          {counterparty.nickname || presentAgentId(counterparty.id)}
        </CopyAgentId>
      </div>
      <div styleName='notes'>
        {notes}
      </div>
    </div>
    <div styleName='amount-and-balance'>
      <div styleName='amount'>
        {presentedAmount}
      </div>
      {presentBalance && <div styleName='transaction-balance'>
        {presentHolofuelAmount(presentBalance)}
      </div>}
    </div>
    {pending && <CancelButton transaction={transaction} showCancellationModal={showCancellationModal} />}
  </div>
}

function CancelButton ({ showCancellationModal, transaction }) {
  return <div
    onClick={() => showCancellationModal(transaction)}
    styleName='cancel-button'
    data-testid='cancel-button'>
    -
  </div>
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
