export const ACCOUNT_TABS = ['overview', 'plans', 'payment', 'history', 'developer'] as const

export type AccountTab = (typeof ACCOUNT_TABS)[number]
