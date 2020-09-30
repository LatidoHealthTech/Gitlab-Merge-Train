import { MergeRequest } from './gitlabTypes/MergeRequest';
import { GitlabEx } from './GitlabEx';
import { pipelineStatus } from './GitlabEx';
import { mergeMap } from 'rxjs/operators';
import { tap } from 'rxjs/operators';
import { filter } from 'rxjs/operators';
import { take } from 'rxjs/operators';
import { from } from 'rxjs';
import { PollStatus } from './GitlabEx';

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;

type passengerFailureState =  'failed' | 'not_mergable' | 'pipelines_not_cancelable' | 'rebase_failed' | 'merge_failed' | 'pipeline_failed';
type passengerActiveState = 'running' | 'waiting_for_pipeline' | 'wait_for_merge';
type passengerPendingState = 'pending' | 'que' | 'created';
export type passengerState = 'finished' | passengerActiveState | passengerFailureState | passengerPendingState;

export class Passenger extends MergeRequest {
  private _gitlab: GitlabEx;
  private commentId: string | number;
  public state: passengerState = 'created';

  constructor(init: Partial<MergeRequest> = {}, gitlab: GitlabEx) {
    super();
    Object.assign(this, init);
    this._gitlab = gitlab;
  }

  public async setStatus(status: passengerState, failed = false) {
    let fresh = await this._gitlab.getMergeRequest(this.iid);
    fresh.labels = fresh.labels.filter(label => !label.startsWith('merge_train/'));
    fresh.labels.push('merge_train/' + status);
    this.state = status;
    if (failed) {
      fresh.labels.push('merge_train/failed');
      this.state = 'failed';
      fresh.labels = fresh.labels.filter(label => label !== 'merge_train');
    }
    const updated = await this._gitlab.updateMergeRequest(fresh);
    Object.assign(this, updated);
  }

  public async setTrainId(trainId: string) {
    let fresh = await this._gitlab.getMergeRequest(this.iid);
    fresh.labels = fresh.labels.filter(label => !label.startsWith('merge_train_id/'));
    fresh.labels.push('merge_train_id/' + trainId);
    const updated = await this._gitlab.updateMergeRequest(fresh);
    Object.assign(this, updated);
  }

  public async comment(text, logToConsole = true) {
    if (logToConsole) console.log(text);
    const updateId = await this._gitlab.commentMergeRequest(this, text, this.commentId);
    this.commentId = updateId.id;
    return;
  }

  public async cancelPipelineByStatus(status: pipelineStatus[], deletePipeline = false) {
    const pipelines = await this._gitlab.getPipelinesByMR(this.iid);
    for (const pipeline of pipelines) {
      if (status.includes(pipeline.status)) {
        if (deletePipeline) {
          this.comment('Deleting: ' + pipeline.web_url);
          await this._gitlab.deletePipeline(pipeline.id);
        } else {
          this.comment('Cancelling: ' + pipeline.web_url);
          await this._gitlab.cancelPipeline(pipeline.id);
        }
      }
    }
  }

  public isMergeable(): Promise<PollStatus<MergeRequest>>{
    return this._gitlab.pollMergeRequest(this.iid, { interval: SECOND * 5, timeout: MINUTE * 5, runAtLeast: 2 })
      .pipe(
        tap(mrPollState => console.log('Running, trying to merge: ' + mrPollState.polledObj.toString())),
        tap(mrPollState => {
          if (mrPollState.polledObj.merge_status !== 'can_be_merged')
            throw new Error('Merge status is ' + mrPollState.polledObj.merge_status);
        }),
        take(3)
      ).toPromise();
  }

  public cancelAllPipelines(deletePipeline = false) {
    const status: pipelineStatus[] = ['running', 'pending', 'created', 'canceled', 'failed'];
    return this._gitlab.pollMRPipelines(this.iid, { interval: SECOND * 15, timeout: MINUTE * 2, runAtLeast: 1 }).pipe(
      mergeMap(poll => from(this.cancelPipelineByStatus(status, deletePipeline).then(() => poll))),
      tap(pollStatus => console.log('All MR Pipelines: \n ' + pollStatus.polledObj.map(pipeline => pipeline.toString()).join(' \n '))),
      filter(pollStatus => !pollStatus.polledObj.some(pipeline => pipeline.status === 'running' || pipeline.status === 'pending')),
      // filter(pollStatus => !deletePipeline || !pollStatus.polledObj.some(pipeline => pipeline.status === 'failed')),
      take(1)
    ).toPromise();
  }

  toString() {
    return this.title + ' (' + this.web_url + ')';
  }

  public async rebase() {
    await this._gitlab.rebaseMR(this.iid);
    return await this._gitlab.pollMergeRequest(this.iid, { interval: SECOND * 5, timeout: MINUTE * 10, runAtLeast: 2 })
      .pipe(
        tap(mrPollState => console.log('Waiting for rebase: ' + mrPollState.polledObj.toString())),
        tap(mrPollState => {
          if (mrPollState.polledObj.merge_error)
            throw new Error('Rebase failed: ' + mrPollState.polledObj.merge_error);
        }),
        filter(mr => mr.polledObj.rebase_in_progress === false),
        take(3)
      ).toPromise();
  }

  merge() {
    return this._gitlab.mergeWPS(this.iid);
  }
}
