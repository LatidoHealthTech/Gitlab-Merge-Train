import * as express from 'express';
import { MergeRequestWebHook } from './gitlabTypes/MergeRequestWebHook';
import chalk from 'chalk';
import { RailwayStation } from './RailwayStation';
import { GitlabEx } from './GitlabEx';
import * as bodyParser from 'body-parser';

export class Server {
  private _gitlab: GitlabEx;
  private _station: RailwayStation;

  public get port(): number {
    return this._port;
  }

  private static _instance: Server;
  private _app: express.Application;

  constructor(private _port: number) {
    if (Server._instance) {
      throw new Error('Error: Instantiation failed: Use Server.getInstance() instead of new.');
    }
    Server._instance = this;
    this._app = express();

    if (!process.env.GITLAB_TOKEN) {
      console.log(chalk.red('GITLAB_TOKEN env is not set! Aborting.'));
      process.exit(1);
    }

    const protocol = process.env.HTTPS === 'true' ? 'https://' : 'http://';
    const addr = process.env.GITLAB_HOST;
    this._gitlab = new GitlabEx({
      host:  protocol + addr,
      token: process.env.GITLAB_TOKEN,
      projectId: 92
    });

    this._station = new RailwayStation(this._gitlab);
  }

  public static getInstance(): Server {
    return Server._instance;
  }

  public async start() {
    // await this._station.check();
    this._app.use(bodyParser.json());
    this._app.post('/mergerequest', async (req, resp) => {
      const body: MergeRequestWebHook = req.body;

      if (process.env.DEBUG) {
        // console.log(req.body);
        console.log(chalk.gray('Got MR: ' + body.object_attributes.title + ' (' + body.object_attributes.url + ')'));
      }

      if (body && body.labels && body.labels.map(lbl => lbl.title).includes('merge_train')) {
        if (process.env.DEBUG) {
          console.log('Found label merge_train');
        }

        try {
          if (!this._station.isIIDOnBoard(body.object_attributes.iid)){
            await this._station.check();
          } else {
            if (process.env.DEBUG) {
              console.log('Already on board: ' + body.object_attributes.iid + ' - ' + body.object_attributes.title);
            }
          }
          resp.sendStatus(200);
        } catch (e) {
          console.log(e);
          resp.sendStatus(500);
        }
      } else {
        if (process.env.DEBUG) {
          console.log(chalk.gray('Ignoring, no merge_train label found.'));
        }
        resp.sendStatus(201);
      }
    });

    this._app.listen(this.port, () => {
      console.log(chalk.green('Merge Train Server listening on ' + this._port));
    });
  }
}
