import { promises as fs } from "fs";
import { join } from "path";
import { LLMResponse } from "../types";

export interface ChatLogEntry {
    timestamp: Date;
    chatId: string;
    prompt: string;
    temperature: number;
    response: LLMResponse;
    stage?: string;
    context?: string;
}

export class ChatLogger {
    private readonly logDir: string;

    constructor(logDir: string = "./chat-logs") {
        this.logDir = logDir;
        this.ensureLogDirectory();
    }

    private async ensureLogDirectory(): Promise<void> {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            console.error("Failed to create log directory:", error);
        }
    }

    async logChatInteraction(entry: ChatLogEntry): Promise<void> {
        try {
            const logFileName = `${entry.chatId}.jsonl`;
            const logFilePath = join(this.logDir, logFileName);

            const logLine =
                JSON.stringify({
                    timestamp: entry.timestamp.toISOString(),
                    chatId: entry.chatId,
                    prompt: entry.prompt,
                    temperature: entry.temperature,
                    response: {
                        content: entry.response.content,
                        confidence: entry.response.confidence,
                        metadata: entry.response.metadata,
                    },
                    stage: entry.stage,
                    context: entry.context,
                }) + "\n";

            await fs.appendFile(logFilePath, logLine, "utf8");
        } catch (error) {
            console.error(
                `Failed to log chat interaction for ${entry.chatId}:`,
                error
            );
        }
    }

    async getChatLogs(chatId: string): Promise<ChatLogEntry[]> {
        try {
            const logFileName = `${chatId}.jsonl`;
            const logFilePath = join(this.logDir, logFileName);

            const fileContent = await fs.readFile(logFilePath, "utf8");
            const lines = fileContent
                .trim()
                .split("\n")
                .filter((line) => line.trim());

            return lines.map((line) => {
                const parsed = JSON.parse(line);
                return {
                    ...parsed,
                    timestamp: new Date(parsed.timestamp),
                };
            });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return [];
            }
            console.error(`Failed to read chat logs for ${chatId}:`, error);
            return [];
        }
    }

    async listChatIds(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.logDir);
            return files
                .filter((file) => file.endsWith(".jsonl"))
                .map((file) => file.replace(".jsonl", ""));
        } catch (error) {
            console.error("Failed to list chat IDs:", error);
            return [];
        }
    }

    async deleteChatLogs(chatId: string): Promise<void> {
        try {
            const logFileName = `${chatId}.jsonl`;
            const logFilePath = join(this.logDir, logFileName);
            await fs.unlink(logFilePath);
        } catch (error) {
            console.error(`Failed to delete chat logs for ${chatId}:`, error);
        }
    }
}
