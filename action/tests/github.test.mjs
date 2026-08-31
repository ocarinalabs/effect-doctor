import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { publish } from "../github.mjs";
import { metricsFor, parseDoctorReport, reviewMarker } from "../report.mjs";

const parsed = parseDoctorReport(
  readFileSync(new URL("fixtures/scan.json", import.meta.url), "utf-8")
);

const context = {
  payload: {
    pull_request: { head: { sha: "head-sha" }, number: 17 },
  },
  repo: { owner: "ocarinalabs", repo: "effect-doctor" },
};

const makeResult = (overrides = {}) => ({
  blocked: false,
  blocking: "none",
  changedLines: {
    "src/log.ts": [4],
    "src/program.ts": [12],
  },
  completed: true,
  directory: "packages/app",
  doctorVersion: "0.1.0",
  findings: parsed.findings,
  metrics: metricsFor(parsed.findings),
  repositoryPrefix: "packages/app",
  resolved: [],
  scope: "full",
  ...overrides,
});

const withResultFile = async (result, use) => {
  const directory = mkdtempSync(join(tmpdir(), "effect-doctor-publish-"));
  const resultPath = join(directory, "result.json");
  writeFileSync(resultPath, `${JSON.stringify(result)}\n`);
  try {
    await use(resultPath);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

const listReviewComments = () => {
  throw new Error("paginate must receive the review-comment endpoint");
};

const makeReviewClient = ({ previous = [] } = {}) => {
  const events = [];
  const warnings = [];
  return {
    core: { warning: (message) => warnings.push(message) },
    events,
    github: {
      paginate: (endpoint, request) => {
        assert.equal(endpoint, listReviewComments);
        events.push({ kind: "list", request });
        return previous;
      },
      rest: {
        pulls: {
          createReview: (request) => {
            events.push({ kind: "create", request });
          },
          deleteReviewComment: (request) => {
            events.push({ kind: "delete", request });
          },
          listReviewComments,
        },
      },
    },
    warnings,
  };
};

const publishReviews = (client, resultPath) =>
  publish({
    comment: "false",
    commitStatus: "false",
    core: client.core,
    context,
    github: client.github,
    resultPath,
    reviewComments: "true",
  });

test("publish replaces stale reviews with comments on changed lines", async () => {
  const marker = reviewMarker("packages/app");
  const client = makeReviewClient({
    previous: [
      { body: `${marker}\nold`, id: 11, user: { type: "Bot" } },
      { body: "unrelated", id: 12, user: { type: "Bot" } },
      { body: marker, id: 13, user: { type: "User" } },
    ],
  });

  await withResultFile(makeResult(), (resultPath) =>
    publishReviews(client, resultPath)
  );

  assert.deepEqual(
    client.events.map((event) => event.kind),
    ["list", "create", "delete"]
  );
  const review = client.events[1].request;
  assert.deepEqual(
    review.comments.map((comment) => [
      comment.path,
      comment.line,
      comment.side,
    ]),
    [
      ["packages/app/src/log.ts", 4, "RIGHT"],
      ["packages/app/src/program.ts", 12, "RIGHT"],
    ]
  );
  assert.equal(review.commit_id, "head-sha");
  assert.equal(review.event, "COMMENT");
  assert.equal(review.pull_number, 17);
  assert.match(review.comments[0].body, /prefer-structured-log-data/u);
  assert.deepEqual(client.events[2].request, {
    comment_id: 11,
    owner: "ocarinalabs",
    repo: "effect-doctor",
  });
  assert.deepEqual(client.warnings, []);
});

test("publish caps one review at 25 comments", async () => {
  const [finding] = parsed.findings;
  const findings = Array.from({ length: 40 }, (_, index) => ({
    ...finding,
    fingerprint: `finding-${index + 1}`,
    location: {
      ...finding.location,
      end: { ...finding.location.end, line: index + 1 },
      file: "src/program.ts",
      start: { ...finding.location.start, line: index + 1 },
    },
  }));
  const client = makeReviewClient();
  const result = makeResult({
    changedLines: {
      "src/program.ts": Array.from({ length: 40 }, (_, index) => index + 1),
    },
    directory: ".",
    findings,
    metrics: metricsFor(findings),
    repositoryPrefix: ".",
  });

  await withResultFile(result, (resultPath) =>
    publishReviews(client, resultPath)
  );

  assert.deepEqual(
    client.events.map((event) => event.kind),
    ["list", "create"]
  );
  const { comments } = client.events[1].request;
  assert.equal(comments.length, 25);
  assert.deepEqual(
    comments.map((comment) => comment.line),
    Array.from({ length: 25 }, (_, index) => index + 1)
  );
  assert.equal(
    comments.every((comment) => comment.path === "src/program.ts"),
    true
  );
  assert.deepEqual(client.warnings, []);
});

test("publish removes stale reviews when no finding is on a changed line", async () => {
  const client = makeReviewClient({
    previous: [
      {
        body: reviewMarker("packages/app"),
        id: 21,
        user: { type: "Bot" },
      },
    ],
  });

  await withResultFile(makeResult({ changedLines: {} }), (resultPath) =>
    publishReviews(client, resultPath)
  );

  assert.deepEqual(
    client.events.map((event) => event.kind),
    ["list", "delete"]
  );
  assert.equal(client.events[1].request.comment_id, 21);
  assert.deepEqual(client.warnings, []);
});

test("publish skips reviews for incomplete analysis", async () => {
  const client = makeReviewClient();

  await withResultFile(makeResult({ completed: false }), (resultPath) =>
    publishReviews(client, resultPath)
  );

  assert.deepEqual(client.events, []);
  assert.deepEqual(client.warnings, []);
});
