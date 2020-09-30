import * as https from 'https';
import * as http from 'http';
import { from, Observable } from 'rxjs';
import { take, retryWhen, tap, delay } from 'rxjs/operators';

export class HttpError extends Error {
  statusCode?: number;
  statusMessage?: string;

  constructor(message: any, init: Partial<{ statusCode: number, statusMessage: string }> = {}) {
    super(message);
    this.statusCode = init.statusCode;
    this.statusMessage = init.statusMessage;
  }
}

export class GitlabReq {
  public static BASE_PATH = '/api/v4';
  public static token = process.env.GITLAB_TOKEN;
  public static retries = 12 * 2; // 2 minutes
  private static _delay = 5000;

  public static async post(path, data) {
    let count = 0;
    return await this._rqst('POST', path, data)
      .pipe(
        retryWhen(err => err.pipe(
          tap( ()  => {if (count++ > this.retries) throw new Error('too many retries'); }),
          tap(e => console.log('HTTP Error: ' + e + '\n retry #' + count)),
          delay(this._delay))),
        take(1)
      ).toPromise();
  }

  public static async get(path) {
    let count = 0;
    return  await this._rqst('GET', path, null)
      .pipe(
        retryWhen(err => err.pipe(
          tap( ()  => {if (count++ > this.retries) throw new Error('too many retries'); }),
          tap(e => console.log('HTTP Error: ' + e + '\n retry #' + count)
          ), delay(this._delay))),
        take(1)
      ).toPromise();
  }

  public static async put(path, data) {
    let count = 0;
    return  await this._rqst('PUT', path, data)
      .pipe(
        retryWhen(err => err.pipe(
          tap( ()  => {if (count++ > this.retries) throw new Error('too many retries'); }),
          tap(e => console.log('HTTP Error: ' + e + '\n retry #' + count)
          ), delay(this._delay))),
        take(1)
      ).toPromise();
  }

  public static del(path) {
    let count = 0;
    return this._rqst('DELETE', path, null)
      .pipe(
        retryWhen(err => err.pipe(
          tap( ()  => {if (count++ > this.retries) throw new Error('too many retries'); }),
          tap(e => console.log('HTTP Error: ' + e + '\n retry #' + count)
          ), delay(this._delay))),
        take(1)
      ).toPromise();
  }

  private static _rqst(method, path, data): Observable<any> {
    if (!this.token) {
      throw new Error('No GITLAB_API_TOKEN set!');
    }
    if (!data)
      data = null;

    return from(new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': 'application/json',
        'Private-Token': this.token,
      };

      path = this.BASE_PATH + path;

      let protocol: typeof import('http') | typeof import('https') = https;

      if (process.env.HTTPS === 'false') {
        protocol = http;
      }

      let req = protocol.request({
        method: method,
        host: process.env.GITLAB_HOST,
        path: path,
        headers
      }, (res) => {
        let error = false;

        if (!res.statusCode || res.statusCode < 200 || res.statusCode > 399)
          error = true;

        let resData = '';
        res.on('error', err => reject(err));
        res.on('data', dataresp => resData += dataresp.toString());
        res.on('end', () => {
          if (error) {
            reject(new HttpError('Response status ' + res.statusCode + '\n' + resData, res));
          } else {
            try {
              if (resData && resData.length)
                resolve(JSON.parse(resData));
              else
                resolve();
            } catch (e) {
              reject('Error parsing result data\n' + e.message);
            }
          }
        });
      }).on('error', err => reject(err));

      let dataString;
      try {
        dataString = JSON.stringify(data);
      } catch (e) {
        throw new Error('Error stringify request data:\n' + e.message);
      }

      req.write(dataString);
      req.end();
    }));
  }

}
