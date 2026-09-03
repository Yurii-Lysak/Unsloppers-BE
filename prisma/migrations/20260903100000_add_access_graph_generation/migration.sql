-- Story 1.13 — D1/AD-4 relationship-graph generation counter for access-resolution cache invalidation.
CREATE TABLE "access_graph_generation" (
    "id" TEXT NOT NULL,
    "generation" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "access_graph_generation_pkey" PRIMARY KEY ("id")
);

INSERT INTO "access_graph_generation" ("id", "generation") VALUES ('default', 0);
