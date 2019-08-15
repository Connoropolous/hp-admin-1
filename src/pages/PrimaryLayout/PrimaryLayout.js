import React, { useContext, useState } from 'react'
import { Route } from 'react-router-dom'
import './PrimaryLayout.module.css'
import Dashboard from 'pages/Dashboard'
import MainMenu, { Menu } from 'pages/MainMenu'
import HappHosting from 'pages/HappHosting'
import Settings from 'pages/Settings'
import Tos from 'pages/Tos'
import Button from 'components/Button'
import ScreenWidthContext from 'contexts/screenWidth'
import cx from 'classnames'

export function PrimaryLayout () {
  const isWide = useContext(ScreenWidthContext)

  return <div styleName={cx('primary-layout', { wide: isWide }, { narrow: !isWide })}>
    <div>
      <Route path='/(|dashboard)' exact component={Dashboard} />
      <Route path='/menu' component={MainMenu} />
      <Route path='/happ-hosting' component={HappHosting} />
      <Route path='/settings' exact component={Settings} />
      <Route path='/tos' exact component={Tos} />
    </div>
  </div>
}

export function SideMenu () {
  const [expanded, setExpanded] = useState(false)
  return <div styleName='side-menu'>
    <div styleName='menu-link'>
      <Button onClick={() => setExpanded(!expanded)}>Menu</Button>
    </div>
    {expanded && <Menu />}
  </div>
}

export default PrimaryLayout
