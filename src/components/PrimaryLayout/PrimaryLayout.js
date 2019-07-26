import React from 'react'
import { Route, Link } from 'react-router-dom'
import './PrimaryLayout.module.css'
import Dashboard from 'components/Dashboard'
import MainMenu from 'components/MainMenu'

export function PrimaryLayout () {
  return (
    <div styleName='primary-layout'>
      <header>
        <div styleName='menu-link'>
          <Link to='/menu' >Menu</Link>
        </div>

        <Route path='/(|dashboard)' exact component={Dashboard} />
        <Route path='/menu' component={MainMenu} />

      </header>
    </div>
  )
}

export default PrimaryLayout