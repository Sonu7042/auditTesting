CREATE TABLE "WorkerRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerRole_name_key" ON "WorkerRole"("name");

INSERT INTO "WorkerRole" ("id", "name")
VALUES
    (gen_random_uuid(), 'Welder'),
    (gen_random_uuid(), 'Engineer'),
    (gen_random_uuid(), 'Supervisor')
ON CONFLICT ("name") DO NOTHING;
