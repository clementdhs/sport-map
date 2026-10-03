import type { Climb } from '#shared/utils/slopes'

// Voice guidance of follow mode: which announcements to make as the outing goes on. Pure functions over a
// plain state; turning them into sentences and speaking them is up to useVoiceGuide.

export const VOICE_ANNOUNCEMENTS = ['track', 'kilometres', 'climbs', 'arrival'] as const
export type VoiceAnnouncement = typeof VOICE_ANNOUNCEMENTS[number]

// Climbs are announced this far ahead, when they average at least CLIMB_MIN_GRADE (a long false flat isn't
// worth it). Their gain threshold is the one of the route page's main climb.
export const CLIMB_NOTICE_M = 300
export const CLIMB_MIN_GRADE = 3
// Leaving the track again within this time after an announcement is not announced: the GPS can swing around
// the limit under trees or between buildings.
export const TRACK_REPEAT_MS = 60_000

export type Announcement =
  | { kind: 'offTrack' }
  | { kind: 'backOnTrack' }
  // splitS: time of the last kilometre; averageSpeedMs: average moving speed of the outing
  | { kind: 'kilometre', km: number, elapsedS: number, splitS: number, averageSpeedMs: number | null }
  // inM: distance to the foot of the climb, rounded to 100 m
  | { kind: 'climb', inM: number, lengthM: number, grade: number }
  | { kind: 'arrived' }

export interface GuideState {
  offTrack: boolean
  // Whether the current time off the track was announced, and when the last such announcement was
  offTrackAnnounced: boolean
  offTrackAnnouncedAt: number | null
  // Kilometres announced, and when the last one was reached
  km: number
  kmAt: number
  // Index of the next climb to announce
  nextClimb: number
  arrived: boolean
}

export interface GuideInput {
  now: number
  elapsedS: number
  // Distance actually covered (GPS), for the kilometres
  distanceM: number
  averageSpeedMs: number | null
  // Position along the route, for the climbs; null before the first fix
  doneM: number | null
  offTrack: boolean
  arrived: boolean
}

export function startGuide(startedAt: number): GuideState {
  return { offTrack: false, offTrackAnnounced: false, offTrackAnnouncedAt: null, km: 0, kmAt: startedAt, nextClimb: 0, arrived: false }
}

// The climbs worth announcing, in order along the route.
export function announcedClimbs(all: Climb[]): Climb[] {
  return all.filter(c => c.averageGrade >= CLIMB_MIN_GRADE)
}

// The state after a new position, with what to announce. Every announcement is computed, chosen or not, so
// that turning one on during the outing doesn't bring back old news.
export function guide(state: GuideState, input: GuideInput, climbs: Climb[]): { state: GuideState, announcements: Announcement[] } {
  const next = { ...state }
  const announcements: Announcement[] = []

  if (input.offTrack && !state.offTrack) {
    next.offTrack = true
    if (state.offTrackAnnouncedAt === null || input.now - state.offTrackAnnouncedAt >= TRACK_REPEAT_MS) {
      announcements.push({ kind: 'offTrack' })
      next.offTrackAnnounced = true
      next.offTrackAnnouncedAt = input.now
    }
  }
  else if (!input.offTrack && state.offTrack) {
    next.offTrack = false
    if (state.offTrackAnnounced) announcements.push({ kind: 'backOnTrack' })
    next.offTrackAnnounced = false
  }

  // Several kilometres at once (a long GPS gap): only the last one, with the average time per kilometre.
  const km = Math.floor(input.distanceM / 1000)
  if (km > state.km) {
    announcements.push({
      kind: 'kilometre',
      km,
      elapsedS: input.elapsedS,
      splitS: (input.now - state.kmAt) / 1000 / (km - state.km),
      averageSpeedMs: input.averageSpeedMs,
    })
    next.km = km
    next.kmAt = input.now
  }

  // Climbs already started are skipped (starting the outing halfway up, or a shortcut).
  if (input.doneM !== null) {
    while (next.nextClimb < climbs.length && climbs[next.nextClimb]!.startM <= input.doneM) next.nextClimb++
    const climb = climbs[next.nextClimb]
    if (climb && !input.offTrack && climb.startM - input.doneM <= CLIMB_NOTICE_M) {
      announcements.push({
        kind: 'climb',
        inM: Math.max(100, Math.round((climb.startM - input.doneM) / 100) * 100),
        lengthM: climb.endM - climb.startM,
        grade: climb.averageGrade,
      })
      next.nextClimb++
    }
  }

  if (input.arrived && !state.arrived) {
    announcements.push({ kind: 'arrived' })
    next.arrived = true
  }
  return { state: next, announcements }
}

export interface VoicePrefs {
  enabled: boolean
  announcements: VoiceAnnouncement[]
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = { enabled: false, announcements: [...VOICE_ANNOUNCEMENTS] }

// Saved preferences, ignoring anything unknown (an older or damaged value).
export function parseVoicePrefs(raw: string | null): VoicePrefs {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  }
  catch {
    return DEFAULT_VOICE_PREFS
  }
  if (!value || typeof value !== 'object') return DEFAULT_VOICE_PREFS
  const saved = value as Record<string, unknown>
  return {
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_VOICE_PREFS.enabled,
    announcements: Array.isArray(saved.announcements)
      ? VOICE_ANNOUNCEMENTS.filter(a => (saved.announcements as unknown[]).includes(a))
      : DEFAULT_VOICE_PREFS.announcements,
  }
}

export function announcementSetting(announcement: Announcement): VoiceAnnouncement {
  switch (announcement.kind) {
    case 'offTrack':
    case 'backOnTrack': return 'track'
    case 'kilometre': return 'kilometres'
    case 'climb': return 'climbs'
    case 'arrived': return 'arrival'
  }
}

// Hours, minutes and seconds of a duration, to be read out; seconds are left out beyond an hour.
export function durationParts(seconds: number): { hours: number, minutes: number, seconds: number } {
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  return { hours, minutes: Math.floor((total % 3600) / 60), seconds: hours ? 0 : total % 60 }
}
