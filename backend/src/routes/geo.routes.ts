import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// PLZ → place lookups are proxied through us rather than called from the app
// directly: it keeps the user's location out of a third party's logs, lets us
// cache aggressively (the mapping is effectively static), and means swapping
// the upstream source later doesn't require a new app build.

interface PlzPlace {
  plz: string
  city: string
  state?: string
  district?: string
}

const cache = new Map<string, PlzPlace[]>()
const CACHE_MAX = 5000

interface OpenPlzLocality {
  postalCode?: string
  name?: string
  federalState?: { name?: string }
  district?: { name?: string }
}

async function lookupUpstream(plz: string): Promise<PlzPlace[]> {
  const res = await fetch(
    `https://openplzapi.org/de/Localities?postalCode=${encodeURIComponent(plz)}`,
    { signal: AbortSignal.timeout(6000) },
  )
  if (!res.ok) throw new Error(`UPSTREAM_${res.status}`)

  const body = (await res.json()) as OpenPlzLocality[]
  if (!Array.isArray(body)) return []

  return body
    .filter((entry) => entry?.name)
    .map((entry) => ({
      plz: entry.postalCode ?? plz,
      city: entry.name as string,
      state: entry.federalState?.name,
      district: entry.district?.name,
    }))
}

export async function geoRoutes(app: FastifyInstance) {
  // GET /geo/plz/:plz — resolve a German postal code to its place(s).
  // Public: it's non-personal reference data and the signup/address forms need
  // it before a user is authenticated.
  app.get('/plz/:plz', async (request, reply) => {
    const params = z.object({ plz: z.string().regex(/^\d{5}$/) }).safeParse(request.params)
    if (!params.success) {
      return reply.status(400).send({ error: 'INVALID_PLZ' })
    }

    const { plz } = params.data

    const cached = cache.get(plz)
    if (cached) return reply.send({ plz, places: cached, cached: true })

    try {
      const places = await lookupUpstream(plz)
      if (cache.size >= CACHE_MAX) cache.clear()
      cache.set(plz, places)
      return reply.send({ plz, places, cached: false })
    } catch {
      // Never hard-fail the caller: the form still works, it just won't
      // pre-fill the city.
      return reply.status(200).send({ plz, places: [], unavailable: true })
    }
  })
}
