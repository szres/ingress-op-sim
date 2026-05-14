import type { Link, Field, Agent } from './gameStore'

export interface ScoringContext {
  links: Link[]
  fields: Field[]
  agents: Agent[]
}

export interface ScoringRule {
  id: string
  label: string
  compute(ctx: ScoringContext): Map<string, number>
}

const orionRule: ScoringRule = {
  id: '2026-orion-global-op',
  label: '2026 Orion Global Op',
  compute({ links, fields, agents }) {
    const scores = new Map<string, number>()
    const inc = (agentId: string, pts: number) => {
      scores.set(agentId, (scores.get(agentId) ?? 0) + pts)
    }

    for (const [, , agentId] of links) {
      inc(agentId, 2)
    }

    for (const field of fields) {
      const linkAgents = field[4]
      if (!linkAgents) {
        inc(field[3], 4)
        continue
      }
      const unique = new Set(linkAgents)
      const pts = unique.size === 1 ? 4 : unique.size === 2 ? 12 : 30
      for (const aId of unique) {
        inc(aId, pts)
      }
    }

    for (const a of agents) {
      if (!scores.has(a.id)) scores.set(a.id, 0)
    }

    return scores
  },
}

export const scoringRules: ScoringRule[] = [orionRule]

export function getScoringRule(id: string): ScoringRule | undefined {
  return scoringRules.find(r => r.id === id)
}

export function computeScores(ctx: ScoringContext, ruleId: string | null): Map<string, number> {
  if (!ruleId) return new Map(ctx.agents.map(a => [a.id, 0]))
  const rule = getScoringRule(ruleId)
  if (!rule) return new Map(ctx.agents.map(a => [a.id, 0]))
  return rule.compute(ctx)
}
