import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Story 1.16 — Prisma 7 reads seed config from here, not from a
    // package.json "prisma" key. `prisma migrate dev` auto-runs this after
    // applying pending migrations locally, for interactive convenience.
    //
    // NOT used by `npm run db:seed` or `postbuild` — verified (not
    // hypothetical) that Prisma 7's `prisma db seed` CLI always prints "The
    // seed command has been executed" and exits 0 regardless of this
    // command's real exit code (reproduced directly: a seed script that
    // throws and calls `process.exit(1)` still yields `prisma db seed` exit
    // code 0). That's silent, unacceptable failure-swallowing for the
    // auto-deploy path this story exists to guarantee, so `db:seed` in
    // package.json runs the same command directly instead, bypassing this
    // wrapper. This config key stays only for `migrate dev`'s auto-seed
    // convenience — a human is present for that flow and can rerun
    // `npm run db:seed` to see the real error if something looks off.
    //
    // Deviates from the spec's literal `"ts-node prisma/seed.ts"` — verified
    // (not hypothetical) that raw ts-node cannot resolve this project's
    // Prisma 7 generated client: it's TypeScript source under
    // `src/generated/prisma/` whose relative imports already carry the
    // post-build `.js` extension nodenext module resolution requires (e.g.
    // `require('./internal/class.js')` inside `client.ts`), and ts-node's
    // classic CommonJS require hook does not fall back from a literal `.js`
    // specifier to a sibling `.ts` file — confirmed by reproducing the same
    // `Cannot find module './internal/class.js'` failure in an isolated
    // nodenext+ts-node sandbox, unrelated to anything in this feature.
    // `nest build` compiles that relative-import graph into real `.js`
    // files under `dist/`, so this command builds first (cheap, and the
    // repo's own `nest-cli.json` always cleans `dist/` first) and runs the
    // compiled seed — exactly the sanctioned fallback named in this spec's
    // Verification section ("fall back to running the compiled seed ...
    // instead of raw ts-node").
    seed: 'nest build && node dist/prisma/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
