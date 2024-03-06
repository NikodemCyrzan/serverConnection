// Buffer
export type Buffer = BufferData[];

export type BufferData = BufferMessage | BufferRequest;

export type StorageBuffer = BufferMessage[];

export type BufferDataBase = {
	type: ReqestType;
	url: string;
	json: string;
};

export type ReqestType = "message" | "request";

export type BufferMessage = BufferDataBase & {
	type: "message";
	uuid: string;
};

export type BufferRequest = BufferDataBase & {
	type: "request";
	callback: (response: any) => void;
};

// Request
export type Response = SuccessResponse | ErrorResponse;

export type SuccessResponse = ResponseBase & {
	status: "success";
	data: object;
};

export type ErrorResponse = ResponseBase & {
	status: "error";
};

export type ResponseBase = {
	status: "success" | "error";
};
