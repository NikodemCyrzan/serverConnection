import * as Types from "./types";
import generateUuid from "react-uuid";

const STORAGE_UNSENT_BUFFER = "unsentBuffer";
const STARTING_TIMEOUT = 100;

let unsentBuffer: Types.Buffer = [];
let isResenderRunning = false;
let timeout = STARTING_TIMEOUT;

function sendRequest(url: string, json: string) {
	return fetch(url, {
		method: "POST",
		body: json,
	}).then((res) => {
		if (!res.ok) throw new Error("Network error");
		return res;
	});
}

/**
 * Tries send all requests and messages from `unsentBuffer` as long as buffer is not empty
 * @param [isSelfCalled=false] is running recursively
 */
async function runResender(isSelfCalled = false) {
	if (isResenderRunning && !isSelfCalled) return;
	isResenderRunning = true;

	let storageUnsentBuffer = getStorageUnsentBuffer();

	unsentBuffer.forEach(async (req) => {
		const { type, json, url } = req;

		const result: Types.Response = await sendRequest(url, json)
			.then((res) => {
				if (type === "request") return res.json();

				let result: Types.SuccessResponse = {
					status: "success",
					data: {},
				};
				return result;
			})
			.then((obj) => {
				if (type === "message") return obj;

				let res: Types.SuccessResponse = {
					status: "success",
					data: obj,
				};
				return res;
			})
			.catch(() => {
				let res: Types.ErrorResponse = {
					status: "error",
				};
				return res;
			});

		if (result.status === "success") {
			if (type === "request") req.callback(result.data);

			// removing sent request from buffer
			unsentBuffer = unsentBuffer.filter((r) => r !== req);

			if (type === "message") storageUnsentBuffer = storageUnsentBuffer.filter((r) => r.uuid != req.uuid);
		}
	});

	setStorageUnsentBuffer(storageUnsentBuffer);

	if (unsentBuffer.length > 0)
		setTimeout(() => {
			runResender(true);
			timeout *= 3;
		}, timeout);
	else {
		isResenderRunning = false;
		timeout = STARTING_TIMEOUT;
	}
}

/**
 * Should be called at the beginning of the application lifetime to try resend all unsent requests from localStorage
 */
function sendAllUnsent() {
	let buffer = getStorageUnsentBuffer();

	buffer.forEach(async (req) => {
		const { url, json } = req;

		const result = (await sendRequest(url, json)
			.then(() => ({
				status: "success",
			}))
			.catch(() => ({
				status: "error",
			}))) as Types.ResponseBase;

		// removing sent request from buffer
		if (result.status === "success") buffer = buffer.filter((r) => r.uuid !== req.uuid);
		else unsentBuffer.push(req);
	});
}

function getStorageUnsentBuffer(): Types.StorageBuffer {
	return JSON.parse(localStorage.getItem(STORAGE_UNSENT_BUFFER) ?? "[]") as Types.StorageBuffer;
}

function setStorageUnsentBuffer(storageUnsentBuffer: Types.StorageBuffer) {
	localStorage.setItem(STORAGE_UNSENT_BUFFER, JSON.stringify(storageUnsentBuffer));
}

/**
 * Registers unsent request to appropriate buffers
 * @param bufferData
 */
function registerUnsent(bufferData: Types.BufferData) {
	const { type } = bufferData;

	if (type === "message") setStorageUnsentBuffer([...getStorageUnsentBuffer(), bufferData]);

	unsentBuffer.push(bufferData);
	runResender();
}

/**
 * Sends POST request and expects response
 * @param url destination of request
 * @param data
 * @param onNetworkError
 * @example
 * ```ts
 * (async () => {
 *     const handleError = () => {
 *         console.log("Network error");
 *     }
 *
 *     const response = await sendPOSTRequest("https://example.com", {foo: "bar"}, handleError);
 *     conosle.log(response); // {status: "success", data: [Object]} | {status: "error"}
 * })()
 * ```
 */
async function sendPOSTRequest(url: string, data: object, onNetworkError?: () => void): Promise<Types.Response> {
	const json = JSON.stringify(data);

	return sendRequest(url, json)
		.then((res) => res.json())
		.then((obj) => {
			let res: Types.SuccessResponse = {
				status: "success",
				data: obj,
			};
			return res;
		})
		.catch(async () => {
			onNetworkError?.();

			let response: Response = await new Promise((resolve) => {
				const callback = async (response: Response) => {
					resolve(response);
				};

				registerUnsent({
					type: "request",
					callback,
					json,
					url,
				});
			});

			let result: Types.Response;
			try {
				result = {
					status: "success",
					data: response,
				};
			} catch {
				result = { status: "error" }; // json parsing error
			}
			return result;
		});
}

/**
 * Sends POST request without expecting response
 * @param url destination of request
 * @param data
 * @example
 * ```ts
 * sendPOSTMessage("https://example.com", {foo: "bar"})
 * ```
 */
async function sendPOSTMessage(url: string, data: object) {
	const json = JSON.stringify(data);

	await sendRequest(url, json).catch(() => {
		registerUnsent({
			type: "message",
			url,
			json,
			uuid: generateUuid(),
		});
	});
}

export { sendPOSTMessage, sendPOSTRequest, sendAllUnsent };
