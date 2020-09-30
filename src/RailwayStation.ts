import { GitlabEx } from './GitlabEx';
import { MergeTrain } from './MergeTrain';


export class RailwayStation {
  private gitlab: GitlabEx;
  private _trains: MergeTrain[] = [];

  constructor(gitlab: GitlabEx) {
    this.gitlab = gitlab;
  }

  public async check() {
    const mergeRequests = await this.gitlab.getMergeRequests({label: 'merge_train', state: 'opened', wip: 'no'});

    for (let mergeRequest of mergeRequests) {
      let train = this._trains.find(train => train.destination === mergeRequest.target_branch);
      if (!train) {
        train = new MergeTrain(mergeRequest.target_branch, this.gitlab);
        this._trains.push(train);
      }
      await train.add(mergeRequest);
    }
  }

  isIIDOnBoard(iid: number) {
    for (let train of this._trains) {
      const isOnBoard = (train.active && train.active.iid === iid) || train.que.map(pq => pq.iid).includes(iid);
      if (isOnBoard) {
        return true;
      }
    }
    return false;
  }
}
