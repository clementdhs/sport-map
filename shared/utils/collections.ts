import * as z from 'zod'

// A named list of routes ("Week-end à Annecy"), private or shared.
export const collectionSchema = z.object({
  name: z.string().trim().min(1, 'validation.nameRequired').max(80, 'validation.maxChars'),
  description: z.string().trim().max(500, 'validation.maxChars').optional(),
  is_public: z.boolean(),
})

export type CollectionInput = z.infer<typeof collectionSchema>

// Creating a collection from a route page adds the route right away.
export const collectionCreateSchema = collectionSchema.extend({
  route_id: z.uuid().optional(),
})
