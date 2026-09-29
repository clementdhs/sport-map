import * as z from 'zod'

// A named list of routes ("Week-end à Annecy"), private or shared.
export const collectionSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(80, '80 caractères maximum'),
  description: z.string().trim().max(500, '500 caractères maximum').optional(),
  is_public: z.boolean(),
})

export type CollectionInput = z.infer<typeof collectionSchema>

// Creating a collection from a route page adds the route right away.
export const collectionCreateSchema = collectionSchema.extend({
  route_id: z.uuid().optional(),
})
