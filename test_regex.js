const subject = "Hello {{workspaceName}}";
const workspaceName = "My Workspace";
const result = subject.replace(/\{\{workspaceName\}\}/g, workspaceName);
console.log("Result:", result);
if (result === "Hello My Workspace") {
    console.log("Regex works!");
} else {
    console.log("Regex FAILED!");
}

const htmlBody = "Link: {{inviteLink}}";
const actionLink = "https://example.com";
const htmlResult = htmlBody.replace(/\{\{inviteLink\}\}/g, actionLink);
console.log("HTML Result:", htmlResult);
if (htmlResult === "Link: https://example.com") {
    console.log("HTML Regex works!");
} else {
    console.log("HTML Regex FAILED!");
}
