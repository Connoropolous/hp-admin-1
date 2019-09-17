import React, { useState } from 'react'
import moment from 'moment'
import cx from 'classnames'
import _ from 'lodash'
import { useQuery, useMutation } from '@apollo/react-hooks'
import { isEmpty } from 'lodash/fp'
import './TransactionHistory.module.css'
import Header from 'components/holofuel/Header'
import Button from 'components/holofuel/Button'
import Modal from 'components/holofuel/Modal'

import HolofuelCompletedTransactionsQuery from 'graphql/HolofuelCompletedTransactionsQuery.gql'
import HolofuelWaitingTransactionsQuery from 'graphql/HolofuelWaitingTransactionsQuery.gql'
import HolofuelCancelMutation from 'graphql/HolofuelCancelMutation.gql'

export const MOCK_ACCT_NUM = 'AC1903F8EAAC1903F8EA'

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

// Display - Functional Components with Hooks :
export default function TransactionsHistory ({ history: { push } }) {
  const { data: { holofuelCompletedTransactions: completedTransactions = [] } = {} } = useQuery(HolofuelCompletedTransactionsQuery)
  const { data: { holofuelWaitingTransactions: pendingTransactions = [] } = {} } = useQuery(HolofuelWaitingTransactionsQuery)

  const cancelTransaction = useCancel()
  const [modalTransaction, setModalTransaction] = useState()

  const showCancellationModal = transaction => setModalTransaction(transaction)

  // NOTE: Column Header Titles (or null) => This provides a space fore easy updating of headers, should we decide to rename or substitute a null header with a title.
  const headings = [
    null,
    null,
    'Fees',
    'Amount',
    null
  ]

  return <React.Fragment>
    <Header title='HoloFuel' accountNumber={MOCK_ACCT_NUM} />

    <section styleName='account-ledger-table'>
      <h2 styleName='completed-transactions-title'>History</h2>
      <table styleName='completed-transactions-table'>
        <thead>
          <tr key='heading'>
            {headings && headings.map((header, contentIndex) => {
              return (
                <TransactionTableHeading
                  key={`heading-${contentIndex}`}
                  content={header}
                />
              )
            })}
          </tr>
        </thead>
        <tbody>
          {!isEmpty(pendingTransactions) && pendingTransactions.map(pendingTx => {
            return <TransactionRow
              transaction={pendingTx}
              key={pendingTx.id}
              showCancellationModal={showCancellationModal}
            />
          })}

          {!isEmpty(completedTransactions) && completedTransactions.map(completeTx => {
            return <TransactionRow
              transaction={completeTx}
              key={completeTx.id}
              showCancellationModal={showCancellationModal}
              completed />
          })}
        </tbody>
      </table>
    </section>

    <ConfirmCancellationModal
      handleClose={() => setModalTransaction(null)}
      transaction={modalTransaction}
      cancelTransaction={cancelTransaction} />
  </React.Fragment>
}

const TransactionTableHeading = ({ content }) => {
  return <th id={content ? content.toLowerCase() : null} styleName='completed-tx-col table-headers'>
    {content}
  </th>
}

export function TransactionRow ({ transaction, showCancellationModal, completed }) {
  const { id, timestamp, amount, counterparty, direction, fees, presentBalance, notes } = transaction
  return <tr key={id} styleName={cx('table-content-row', { 'pending-transaction': !completed })} data-testid='transactions-table-row'>
    <td styleName='completed-tx-col table-content'>
      <p data-testid='cell-date'>{formatDateTime(timestamp).date}</p>
      <p data-testid='cell-time'>{formatDateTime(timestamp).time}</p>
    </td>
    <td styleName='completed-tx-col table-content align-left'>
      <h4 data-testid='cell-counterparty'>{makeDisplayName(counterparty).toUpperCase()}</h4>
      <p styleName='italic' data-testid='cell-notes'>{notes || 'none'}</p>
    </td>
    <td styleName={cx('completed-tx-col table-content', { 'red-text': fees !== 0 })} data-testid='cell-fees'>{fees}</td>
    <td styleName={cx('completed-tx-col table-content', { 'red-text': direction === 'outgoing' }, { 'green-text': direction === 'incoming' })} data-testid='cell-amount'>{amount}</td>
    { completed
      ? <td styleName='completed-tx-col table-content' data-testid='cell-present-balance'><p>*Awaiting DNA update*</p>{presentBalance}</td>
      : <td styleName='completed-tx-col table-content' data-testid='cell-pending-item'>
        <p styleName='italic'>Pending</p>
        <CancelButton transaction={transaction} showCancellationModal={showCancellationModal} />
      </td>
    }
  </tr>
}

function CancelButton ({ showCancellationModal, transaction }) {
  return <Button
    onClick={() => showCancellationModal(transaction)}
    styleName='cancel-button'>
    Cancel
  </Button>
}

//
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
      Cancel your {_.capitalize(type)}
      {direction === 'incoming' ? ' for ' : ' of '}
      <span styleName='modal-amount' data-testid='modal-amount'>{Number(amount).toLocaleString()} HF</span>
      {direction === 'incoming' ? ' from ' : ' to '}
      <span styleName='modal-counterparty' data-testid='modal-counterparty'>{makeDisplayName(counterparty)}</span>
      ?
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

// Utils - Helper Functions:
export const makeDisplayName = agentHash => agentHash.substring(agentHash.length - 7) || ''

export function formatDateTime (isoDate) {
  const dateDifference = moment(isoDate).fromNow()
  // If over a year ago, include the year in date
  if (dateDifference.split(' ')[1] === 'years' || dateDifference.split(' ')[1] === 'year') {
    return {
      date: moment(isoDate).format('MMMM D YYYY'),
      time: moment(isoDate).format('h:mm')
    }
  // If over a week ago, include the month and day in date
  } else if (
    dateDifference.split(' ')[1] === 'months' || dateDifference.split(' ')[1] === 'month' ||
    (dateDifference.split(' ')[1] === 'days' && parseInt(dateDifference.split(' ')[0]) >= 7)) {
    return {
      date: moment(isoDate).format('MMMM D'),
      time: moment(isoDate).format('h:mm')
    }
  // If within a week ago, state days lapsed in date
  } else if (dateDifference.split(' ')[1] === 'days' && parseInt(dateDifference.split(' ')[0]) >= 1) {
    return {
      date: dateDifference,
      time: moment(isoDate).format('h:mm')
    }
  // If less than a day ago, state hours, minutes, or seconds lapsed in time
  } else if (
    dateDifference.split(' ')[1] === 'hours' || dateDifference.split(' ')[1] === 'hour' ||
    dateDifference.split(' ')[1] === 'minutes' || dateDifference.split(' ')[1] === 'minute' ||
    dateDifference.split(' ')[2] === 'seconds' || dateDifference.split(' ')[1] === 'second') {
    return {
      date: 'Today',
      time: moment(isoDate).fromNow()
    }
    // Throw Error, iso-timedate cannot be parsed into valid format
  } else throw new Error('Iso timedate is unable to be parsed.', isoDate)
}