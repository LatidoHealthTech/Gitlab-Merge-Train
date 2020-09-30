import { Generators } from './Generators';
import { Passenger, passengerState } from './Passenger';
import { tap, filter, take } from 'rxjs/operators';
import { GitlabEx } from './GitlabEx';
import { MergeRequest } from './gitlabTypes/MergeRequest';

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;

export class MergeTrain {
  id: string = Generators.randomName();
  destination: string;
  que: Passenger[] = [];
  active: Passenger | null = null;
  isRunning = false;
  private gitlab: GitlabEx;

  constructor(destination: string, gitlab: GitlabEx) {
    this.destination = destination;
    this.gitlab = gitlab;
  }

  toString() {
    const running = this.isRunning ? '[runnng] ' : '[waiting] ';
    const active = this.active ? this.active.toString() : 'none';
    return 'Train ' + running + this.id + ' with destination ' + this.destination + ' and ' + this.que.length + ' in que' +
      ' active MR: ' + active;
  }

  async add(mr: MergeRequest) {
    if (this.active && this.active.iid === mr.iid) {
      return
    }

    if (this.que && this.que.map(p => p.iid).includes(mr.iid)) {
      return
    }

    const passenger = new Passenger(mr, this.gitlab);
    this.que.push(passenger);
    await this._printQue(passenger);
    console.log('New passenger: ' + this.destination + ' - ' + passenger.toString());
    await passenger.cancelAllPipelines(false);

    if (!this.isRunning) {
      this.process();
    }
  }

  public async process(){
    const deletePipelines = process.env.DELETE_PIPELINES === 'true';
    while (this.que.length) {
      this.isRunning = true;
      this.active = this.que.shift();

      console.log('\n===========\nChecking ' + this.active);
      await this.active.comment('Running, trying to merge.');
      await this.active.setStatus('running');

      try {
        await this.active.isMergeable();
      } catch (e) {
        await this.active.setStatus('not_mergable', true);
        await this.active.comment('Merge Status is: ' + this.active.merge_status + ' skipping.');
        this.active = null;
        continue;
      }

      try {
        await this.active.comment(deletePipelines ? 'Deleting' : 'Cancelling' + ' all running piplines');
        await this.active.cancelAllPipelines(deletePipelines);
      } catch (e) {
        await this.active.setStatus('pipelines_not_cancelable', true);
        await this.active.comment('Failed to cancel pipelines, skipping this MR.\n' + e);
        this.active = null;
        continue;
      }

      try {
        await this.active.comment('Rebasing & Running new pipeline');
        await this.active.rebase();
      } catch (e) {
        await this.active.comment('Rebasing failed, skipping this MR \n\n' + e);
        await this.active.setStatus('rebase_failed', true);
        if (e.message.includes('405 Method Not Allowed')) {
          await this.active.comment('Failed to rebase, because there are merge-conflicts, or the pipeline has failed, skipping this MR');
        }
        this.active = null;
        continue;
      }

      try {
        await this.active.comment('Setting merge when pipeline succeeds.');
        await this.active.merge();
      } catch (e) {
        await this.active.setStatus('merge_failed', true);
        await this.active.comment('Merging failed, skipping this MR \n\n' + e);
        if (e.message.includes('405 Method Not Allowed')) {
          await this.active.comment('Merge when pipeline successd failed,' +
            ' because there are merge-conflicts, or the pipeline has failed, skipping this MR');
        }
        this.active = null;
        continue;
      }

      try {
        await this.active.comment('Waiting for pipeline to finish.');
        await this.active.setStatus('waiting_for_pipeline');
        const pipelines = await this.gitlab
          .pollMRPipelines(this.active.iid, { interval: SECOND * 10, timeout: HOUR * 2, runAtLeast: 4 })
          .pipe( //                                                             ^^^^ because pipeline can be pending for very long time
            tap(pollStatus => console.log('MR Pipelines: \n ' + pollStatus.polledObj.map(pipeline => pipeline.toString()).join('\n '))),
            filter(pollStatus => !pollStatus.polledObj.some(pipeline => pipeline.status === 'running' || pipeline.status === 'pending')),
            take(5)
          )
          .toPromise();

        if (pipelines.polledObj.map(pipeline => pipeline.status).includes('failed')) {
          throw new Error('The pipeline failed.')
        }
      } catch (e) {
        await this.active.comment('Pipeline failed, skipping this MR\n' + e);
        await this.active.setStatus('pipeline_failed', true);
        this.active = null;
        continue;
      }

      try {
        await this.active.comment('Waiting for status merged');
        await this.active.setStatus('wait_for_merge');
        await this.gitlab.pollMergeRequest(this.active.iid, { interval: SECOND * 5, timeout: MINUTE * 5, runAtLeast: 4 })
          .pipe(
            tap(pollStatus => console.log('Waiting for status merged: ' + pollStatus.polledObj.toString())),
            filter(pollStatus => pollStatus.polledObj.state === 'merged'),
            take(2))
          .toPromise();
      } catch (e) {
        await this.active.comment('Pipeline failed, skipping this MR\n' + e);
        await this.active.setStatus('pipeline_failed', true);
        this.active = null;
        continue;
      }

      await this.active.comment('Successfully merged!');
      await this.active.setStatus('finished');
      this.active = null;
      console.log(this.toString());
    }
    this.isRunning = false;
  }

  private async _failed(status: passengerState, comment: string) {
    await this.active.comment(comment);
    await this.active.setStatus(status, true);
    this.active = null;
  }

  private async _printQue(passenger: Passenger) {
    let text = '';
    for (const _passenger of this.que) {
      text = text + '\n\n' + (this.que.indexOf(_passenger) + 1) + (_passenger.id === passenger.id ? ') **' + _passenger.toString() + '**' : ') ' + _passenger.toString());
    }
    await passenger.setStatus('pending')
    await passenger.comment(this.toString() + '\n\n MR is on Position '+ this.que.length +': ' + text, false);
  }

  private static _sortMRsByLabel(mrA, mrB) {
    let a = mrA.labels.find(label => label.startsWith('merge_train_position/'));
    let b = mrB.labels.find(label => label.startsWith('merge_train_position/'));
    if (!a && !b) return 0; // None of MR's have the position label, leave them at their positions
    if (!a && b) return 1; // move b down, a has no position label
    if (a && !b) return -1; // move a down, b has no position label
    let anum = parseInt(a.substr(a.indexOf('/') + 1));
    let bnum = parseInt(b.substr(b.indexOf('/') + 1));
    if (anum > bnum) return 1;
    if (anum < bnum) return -1;
    if (anum === bnum) return 0;
  }
}
