export function display(json: boolean, data: Record<string, any>): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    for (const [key, value] of Object.entries(data)) {
      if (key === "message") {
        console.log(`  ${value}`);
      } else if (Array.isArray(value)) {
        console.log(`  ${key}: [${value.join(", ")}]`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }
  }
}
