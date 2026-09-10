import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { publish } from "../github.mjs";
import {
  commentMarker,
  metricsFor,
  parseReportShape,
  reviewMarker,
} from "../report.mjs";

const parsed = parseReportShape(
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
  target: {
    entry: "tsconfig.json",
    projects: ["tsconfig.json"],
  },
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

const listIssueComments = () => {
  throw new Error("paginate must receive the issue-comment endpoint");
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
  const marker = reviewMarker("packages/app", "tsconfig.json");
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
        body: reviewMarker("packages/app", "tsconfig.json"),
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

test("publish isolates every GitHub surface by directory and target", async () => {
  const events = [];
  const warnings = [];
  const targetEntry = "configs/effect.json";
  const currentCommentMarker = commentMarker("packages/app", targetEntry);
  const currentReviewMarker = reviewMarker("packages/app", targetEntry);
  const otherCommentMarker = commentMarker(
    "packages/app",
    "configs/other.json"
  );
  const otherReviewMarker = reviewMarker("packages/app", "configs/other.json");
  const github = {
    paginate: (endpoint, request) => {
      events.push({ kind: "list", request });
      if (endpoint === listIssueComments) {
        return [
          {
            body: otherCommentMarker,
            id: 31,
            user: { type: "Bot" },
          },
          {
            body: currentCommentMarker,
            id: 32,
            user: { type: "Bot" },
          },
        ];
      }
      assert.equal(endpoint, listReviewComments);
      return [
        { body: otherReviewMarker, id: 41, user: { type: "Bot" } },
        { body: currentReviewMarker, id: 42, user: { type: "Bot" } },
      ];
    },
    rest: {
      issues: {
        createComment: (request) => events.push({ kind: "comment", request }),
        listComments: listIssueComments,
        updateComment: (request) =>
          events.push({ kind: "update-comment", request }),
      },
      pulls: {
        createReview: (request) => events.push({ kind: "review", request }),
        deleteReviewComment: (request) =>
          events.push({ kind: "delete-review", request }),
        listReviewComments,
      },
      repos: {
        createCommitStatus: (request) =>
          events.push({ kind: "status", request }),
      },
    },
  };
  const result = makeResult({
    target: {
      entry: targetEntry,
      projects: [targetEntry],
    },
  });

  await withResultFile(result, (resultPath) =>
    publish({
      comment: "true",
      commitStatus: "true",
      core: { warning: (message) => warnings.push(message) },
      context,
      github,
      resultPath,
      reviewComments: "true",
    })
  );

  const firstStatus = events.find((event) => event.kind === "status").request;
  assert.match(
    firstStatus.context,
    /^Effect Doctor \(packages\/app\/configs\/effect\.json · [a-f0-9]{12}\)$/u
  );

  const comment = events.find(
    (event) => event.kind === "update-comment"
  ).request;
  assert.equal(comment.comment_id, 32);
  assert.match(comment.body, new RegExp(currentCommentMarker, "u"));
  assert.match(comment.body, /packages\/app\/configs\/effect\.json/u);

  const review = events.find((event) => event.kind === "review").request;
  assert.match(review.comments[0].body, new RegExp(currentReviewMarker, "u"));
  assert.deepEqual(
    events
      .filter((event) => event.kind === "delete-review")
      .map((event) => event.request.comment_id),
    [42]
  );

  await withResultFile(
    makeResult({
      directory: ".",
      repositoryPrefix: ".",
      target: {
        entry: "packages/app/configs/effect.json",
        projects: ["packages/app/configs/effect.json"],
      },
    }),
    (resultPath) =>
      publish({
        comment: "false",
        commitStatus: "true",
        core: { warning: (message) => warnings.push(message) },
        context,
        github,
        resultPath,
        reviewComments: "false",
      })
  );

  const statusContexts = events
    .filter((event) => event.kind === "status")
    .map((event) => event.request.context);
  assert.equal(statusContexts.length, 2);
  assert.equal(new Set(statusContexts).size, 2);
  assert.equal(
    statusContexts.every((value) =>
      /^Effect Doctor \(packages\/app\/configs\/effect\.json · [a-f0-9]{12}\)$/u.test(
        value
      )
    ),
    true
  );
  assert.deepEqual(warnings, []);
});
