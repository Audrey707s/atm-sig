export type HelpTopic={topic:string;text:string;path:string}
export type ChatThread={id:string;title:string;last_preview:string;updated_at:string;created_at:string}
export type ChatEntry={id:string;author:'user'|'assistant';content:string;page_path:string|null;created_at:string}
