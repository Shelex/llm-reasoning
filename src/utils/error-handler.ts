import { Request, Response, NextFunction } from "express";
export interface ErrorResponse {
    error: string;
    message?: string;
    field?: string;
    timestamp: string;
    path?: string;
}

export function errorHandler(
    error: Error,
    req: Request,
    res: Response
): void {
    const timestamp = new Date().toISOString();
    const path = req.path;

    console.error(`[${timestamp}] Error on ${req.method} ${path}:`, error);

    if (
        error.message.includes("Chat session") &&
        error.message.includes("not found")
    ) {
        const response: ErrorResponse = {
            error: "Not Found",
            message: error.message,
            timestamp,
            path,
        };
        res.status(404).json(response);
        return;
    }

    if (error.message.includes("Failed to query LLM")) {
        const response: ErrorResponse = {
            error: "LLM Service Error",
            message: "Unable to process request with language model",
            timestamp,
            path,
        };
        res.status(503).json(response);
        return;
    }

    if (error.name === "SyntaxError" && error.message.includes("JSON")) {
        const response: ErrorResponse = {
            error: "Invalid JSON",
            message: "Request body must be valid JSON",
            timestamp,
            path,
        };
        res.status(400).json(response);
        return;
    }

    const response: ErrorResponse = {
        error: "Internal Server Error",
        message:
            process.env.NODE_ENV === "development"
                ? error.message
                : "An unexpected error occurred",
        timestamp,
        path,
    };

    res.status(500).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
    const response: ErrorResponse = {
        error: "Not Found",
        message: `Route ${req.method} ${req.path} not found`,
        timestamp: new Date().toISOString(),
        path: req.path,
    };

    res.status(404).json(response);
}

export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
