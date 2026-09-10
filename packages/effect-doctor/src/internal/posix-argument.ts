export const posixArgument = (value: string): string =>
  `'${value.replaceAll("'", `'"'"'`)}'`;
