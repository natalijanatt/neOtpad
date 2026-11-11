// Decision half of protect-generated.sh. Takes the PreToolUse payload as argv[2]
// and prints a deny decision for writes inside the generated client directory.
const GENERATED_DIR = 'src/api/generated';

let filePath = '';
try {
  filePath = JSON.parse(process.argv[2] ?? '{}')?.tool_input?.file_path ?? '';
} catch {
  process.exit(0); // unparseable payload: never block the session over it
}

const normalised = String(filePath).replace(/\\/g, '/');
const inGenerated =
  normalised.includes(`/${GENERATED_DIR}/`) || normalised.startsWith(`${GENERATED_DIR}/`);

if (!inGenerated) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `${normalised} is inside ${GENERATED_DIR}/, which is generated from contracts/openapi.json ` +
        `by 'npm run api:generate'. Changing it is a change to the API contract, not a frontend ` +
        `change, and the next generation run discards it.\n\n` +
        `If the type here is wrong, the contract is wrong: the backend has to change the DTO or ` +
        `controller and regenerate contracts/openapi.json. If the contract is right, adapt the ` +
        `calling code in src/ instead.`,
    },
  }),
);
