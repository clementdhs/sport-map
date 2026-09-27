import * as z from 'zod'

export type LngLat = [lng: number, lat: number]

export const SPORT_TYPES = ['running', 'hiking', 'cycling'] as const
export type SportType = typeof SPORT_TYPES[number]

export const SPORT_LABELS: Record<SportType, string> = {
  running: 'Course à pied',
  hiking: 'Randonnée',
  cycling: 'Vélo',
}

export const SPORT_ICONS: Record<SportType, string> = {
  running: 'i-lucide-footprints',
  hiking: 'i-lucide-mountain',
  cycling: 'i-lucide-bike',
}

export const MAX_ROUTE_POINTS = 5000

const coordinateSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
])

export const routeDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(120, '120 caractères maximum'),
  description: z.string().trim().max(2000, '2000 caractères maximum').optional(),
  sport_type: z.enum(SPORT_TYPES),
  is_public: z.boolean(),
})

export const routeCreateSchema = routeDetailsSchema.extend({
  coordinates: z.array(coordinateSchema)
    .min(2, 'Un parcours doit contenir au moins 2 points')
    .max(MAX_ROUTE_POINTS, `${MAX_ROUTE_POINTS} points maximum`),
})

export type RouteDetails = z.infer<typeof routeDetailsSchema>
export type RouteCreatePayload = z.infer<typeof routeCreateSchema>
