export interface Range {
  low: number
  mid: number
  high: number
}

/** One line of a derivation, shown under "How we got this". */
export interface Step {
  label: string
  formula?: string
  value: string
}

export type Verdict = 'take' | 'consider' | 'skip'

export interface Flag {
  level: 'critical' | 'gap' | 'warn' | 'info'
  text: string
}

export type Gender = 'male' | 'female' | 'other'
export type Spouse = 'none' | 'earning' | 'homemaker'
export type CityTier = 'metro' | 'tier2' | 'other'
