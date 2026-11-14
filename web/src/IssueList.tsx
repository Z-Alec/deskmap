import type { Issue } from "./model/validate";
import type { Selection } from "./selection";

type Props = { issues: Issue[]; onSelect: (selection: Selection) => void };

function subjectSelection(subject: Issue["subject"]): Selection {
  return subject.kind === "setup" ? null : subject;
}

export function IssueList({ issues, onSelect }: Props) {
  const errors = issues.filter((issue) => issue.level === "error").length;
  return (
    <details className="issues" open={issues.length > 0}>
      <summary>
        {issues.length === 0 ? "No issues" : `${errors} errors, ${issues.length - errors} warnings`}
      </summary>
      <ul>
        {issues.map((issue, index) => (
          <li key={index}>
            <button className={`issue issue-${issue.level}`} onClick={() => onSelect(subjectSelection(issue.subject))}>
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
