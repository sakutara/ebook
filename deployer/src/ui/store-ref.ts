import { store as singleton } from '../store'

/** Shape of the deployer store; components accept an instance so tests can inject fakes. */
export type DeployerStore = typeof singleton

/** Store used when a component is rendered without a `store` prop. */
export const defaultStore: DeployerStore = singleton
