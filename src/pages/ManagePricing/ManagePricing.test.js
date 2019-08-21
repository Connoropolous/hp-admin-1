import React from 'react'
import { render, fireEvent, act } from '@testing-library/react'
import { MockedProvider } from '@apollo/react-testing'
import wait from 'waait'
import ManagePricing from './ManagePricing'
import HostPricingQuery from 'graphql/HostPricingQuery.gql'
import UpdateHostPricingMutation from 'graphql/UpdateHostPricingMutation.gql'
import { UNITS } from 'models/HostPricing'

const mockHostPricing = {
  units: 'cpu',
  pricePerUnit: '12'
}

const newPrice = '9'

const updateHostPricingMock = {
  request: {
    query: UpdateHostPricingMutation,
    variables: { units: UNITS.storage, pricePerUnit: newPrice }
  },
  result: {
    data: { updateHostPricing: { units: 'not', pricePerUnit: 'used' } }
  },
  newData: jest.fn()
}

const mocks = [
  {
    request: {
      query: HostPricingQuery
    },
    result: {
      data: {
        hostPricing: mockHostPricing
      }
    }
  },
  updateHostPricingMock,
  {
    request: {
      query: UpdateHostPricingMutation,
      variables: { units: UNITS.cpu, pricePerUnit: newPrice }
    },
    result: {
      data: { updateHostPricing: { units: 'not', pricePerUnit: 'used' } }
    }
  }
]

describe('ManagePricing', () => {
  it('renders', async () => {
    const props = {
      history: {}
    }

    let getByLabelText, getByText
    await act(async () => {
      ({ getByLabelText, getByText } = render(<MockedProvider mocks={mocks} addTypename={false}>
        <ManagePricing {...props} />
      </MockedProvider>))
      await wait(1)
    })

    expect(getByText('Price Settings')).toBeInTheDocument()
    expect(getByText('CPU = 12 HF per second')).toBeInTheDocument()
    expect(getByLabelText('HoloFuel per unit').value).toEqual(mockHostPricing.pricePerUnit)
  })

  it('allows you to set and save units and pricePerUnit', async () => {
    const props = {
      history: {}
    }
    let getByLabelText, getByText, getByTestId

    await act(async () => {
      ({ getByLabelText, getByText, getByTestId } = render(<MockedProvider mocks={mocks} addTypename={false}>
        <ManagePricing {...props} />
      </MockedProvider>))
      await wait(1)
    })

    fireEvent.change(getByTestId('units-dropdown'), { target: { value: UNITS.storage } })

    fireEvent.change(getByLabelText('HoloFuel per unit'), { target: { value: newPrice } })

    fireEvent.click(getByText('Save'))

    expect(updateHostPricingMock.newData).toHaveBeenCalled()
  })

  it('changes button state based on user actions', async () => {
    const props = {
      history: {}
    }

    let getByText, getByLabelText
    await act(async () => {
      ({ getByText, getByLabelText } = render(<MockedProvider mocks={mocks} addTypename={false}>
        <ManagePricing {...props} />
      </MockedProvider>))
      await wait(1)
    })

    expect(getByText('Save')).toHaveAttribute('disabled')

    fireEvent.change(getByLabelText('HoloFuel per unit'), { target: { value: newPrice } })

    expect(getByText('Save')).not.toHaveAttribute('disabled')

    act(() => {
      fireEvent.click(getByText('Save'))
    })

    expect(getByText('Saving')).toHaveAttribute('disabled')

    await act(() => wait(1))

    expect(getByText('Saved')).toHaveAttribute('disabled')

    fireEvent.change(getByLabelText('HoloFuel per unit'), { target: { value: '123' } })

    expect(getByText('Save')).not.toHaveAttribute('disabled')
  })
})
