// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as url from "url";
import * as http from "http";
import Q = require("q");

type ScriptResponse = {
    etag: string | null;
    code: number;
    body: string;
};

export class Request {
    public static requestWithEtag(scriptUrl: string, etag?: string | null): Q.Promise<ScriptResponse> {
        return Q.Promise((resolve, reject) => {
            let request: any = scriptUrl;
            if (etag) {
                request = { ...url.parse(scriptUrl), headers: { "If-None-Match": etag } };
            }

            http.get(request, res => {
                let body = "";
                res.on("data", (data: Buffer) => {
                    body += data.toString();
                });
                res.on("end", () => {
                    if (res.statusCode !== 200 && res.statusCode !== 304) {
                        reject(new Error(body));
                    } else {
                        resolve({ body, code: res.statusCode, etag: res.headers ? res.headers.etag : null });
                    }
                });
            })
                .on("error", err => reject(err));
        });
    }

    public static request(scriptUrl: string, expectStatusOK = false): Q.Promise<any> {
        let deferred = Q.defer<string>();
        let req = http.get(scriptUrl, function(res) {
            let responseString = "";
            res.on("data", (data: Buffer) => {
                responseString += data.toString();
            });
            res.on("end", () => {
                if (expectStatusOK && res.statusCode !== 200) {
                    deferred.reject(new Error(responseString));
                } else {
                    deferred.resolve(responseString);
                }
            });
        });
        req.on("error", (err: Error) => {
            deferred.reject(err);
        });
        return deferred.promise;
    }
}
