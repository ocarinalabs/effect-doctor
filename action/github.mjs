import { readFileSync } from "node:fs";
import path from "node:path";

import {
  commentMarker,
  renderSummary,
  reviewMarker,
  statusContext,
  statusDescription,
} from "./report.mjs";

const enabled = (value) => String(value).toLowerCase() === "true";

const runUrl = (context) =>
  `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;

const truncate = (value, maximum) =>
  value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;

const publicationTarget = (result) => [
  result.repositoryPrefix ?? result.directory,
  result.target.entry,
];

const publishStatus = async ({ core, context, github, result }) => {
  const pullRequest = context.payload.pull_request;
  const sha = pullRequest?.head?.sha ?? context.sha;
  try {
    await github.rest.repos.createCommitStatus({
      ...context.repo,
      context: statusContext(...publicationTarget(result)),
      description: truncate(statusDescription(result), 140),
      sha,
      state: result.completed && !result.blocked ? "success" : "failure",
      target_url: runUrl(context),
    });
  } catch (error) {
    core.warning(
      `Effect Doctor could not publish a commit status: ${error.message}`
    );
  }
};

const publishComment = async ({ core, context, github, result }) => {
  const pullRequest = context.payload.pull_request;
  if (pullRequest === undefined) {
    return;
  }
  const body = renderSummary(result);
  const marker = commentMarker(...publicationTarget(result));
  try {
    const comments = await github.paginate(github.rest.issues.listComments, {
      ...context.repo,
      issue_number: pullRequest.number,
      per_page: 100,
    });
    const previous = comments.find(
      (comment) =>
        comment.user?.type === "Bot" && comment.body?.includes(marker)
    );
    await (previous === undefined
      ? github.rest.issues.createComment({
          ...context.repo,
          body,
          issue_number: pullRequest.number,
        })
      : github.rest.issues.updateComment({
          ...context.repo,
          body,
          comment_id: previous.id,
        }));
  } catch (error) {
    core.warning(
      `Effect Doctor could not update the pull request summary: ${error.message}`
    );
  }
};

const pullRequestPath = (prefix, file) =>
  prefix === "." ? file : `${prefix}/${file}`;

const inlineReviewComments = (result, maximum = 25) => {
  const comments = [];
  const marker = reviewMarker(...publicationTarget(result));
  for (const finding of result.findings) {
    const changed = result.changedLines[finding.location.file] ?? [];
    if (!changed.includes(finding.location.start.line)) {
      continue;
    }
    const location = finding.location.start;
    comments.push({
      body: [
        marker,
        `**${finding.ruleId}** (${finding.severity})`,
        "",
        finding.message,
      ].join("\n"),
      line: location.line,
      path: pullRequestPath(result.repositoryPrefix, finding.location.file),
      side: "RIGHT",
    });
    if (comments.length === maximum) {
      break;
    }
  }
  return comments;
};

const previousReviewComments = async ({ context, github, result }) => {
  const comments = await github.paginate(github.rest.pulls.listReviewComments, {
    ...context.repo,
    pull_number: context.payload.pull_request.number,
    per_page: 100,
  });
  return comments.filter(
    (comment) =>
      comment.user?.type === "Bot" &&
      comment.body?.includes(reviewMarker(...publicationTarget(result)))
  );
};

const deleteReviewComments = ({ comments, context, github }) =>
  Promise.all(
    comments.map((comment) =>
      github.rest.pulls.deleteReviewComment({
        ...context.repo,
        comment_id: comment.id,
      })
    )
  );

const publishReviewComments = async ({ core, context, github, result }) => {
  const pullRequest = context.payload.pull_request;
  if (pullRequest === undefined || !result.completed) {
    return;
  }
  try {
    const previous = await previousReviewComments({ context, github, result });
    const comments = inlineReviewComments(result);
    if (comments.length === 0) {
      await deleteReviewComments({ comments: previous, context, github });
      return;
    }
    await github.rest.pulls.createReview({
      ...context.repo,
      comments,
      commit_id: pullRequest.head.sha,
      event: "COMMENT",
      pull_number: pullRequest.number,
    });
    await deleteReviewComments({ comments: previous, context, github });
  } catch (error) {
    core.warning(
      `Effect Doctor could not publish inline review comments: ${error.message}`
    );
  }
};

export const publish = async ({
  comment,
  commitStatus,
  core,
  context,
  github,
  resultPath,
  reviewComments,
}) => {
  const result = JSON.parse(readFileSync(path.resolve(resultPath), "utf-8"));
  if (enabled(commitStatus)) {
    await publishStatus({ core, context, github, result });
  }
  if (enabled(comment)) {
    await publishComment({ core, context, github, result });
  }
  if (enabled(reviewComments)) {
    await publishReviewComments({ core, context, github, result });
  }
};
