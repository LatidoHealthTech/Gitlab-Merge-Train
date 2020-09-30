import { GitlabReq } from './GitlabReq';
import { MergeRequest } from './gitlabTypes/MergeRequest';
import { Observable } from 'rxjs';
import { timer } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { takeWhile } from 'rxjs/operators';
import { tap } from 'rxjs/operators';
import { map } from 'rxjs/operators';


export interface PollSettings {
  interval: number;
  timeout: number;
  runAtLeast: number;
}
export class PollTimeout extends Error {}
export class PollStatus<T> {

  constructor(status: string, timePassed: number, polledObj: T) {
    this.status = status;
    this.timePassed = timePassed;
    this.polledObj = polledObj;
  }

  toString() {
    return 'Polling, status: ' + this.status + ' timepassed: ' + this.timePassed / 1000 + 's';
  }

  status: string;
  timePassed: number;
  polledObj: T;
}

export type pipelineStatus = 'running' | 'success' | 'failed' | 'pending' | 'canceled' | 'skipped' | 'created';

export class Pipeline {
  id: number;
  sha: string;
  ref: string;
  status: pipelineStatus;
  web_url: string;

  constructor(init: Partial<Pipeline> = {}) {
    Object.assign(this, init);
  }

  toString() {
    return this.status + ' (' +  this.web_url + ')';
  }
}

export class GitlabEx {
  public defaultPollSettings = {interval: 10000, timeout: 10000 * 12, runAtLeast: 2};
  public projectId: string | number;

  constructor(init: {host: string, token: string, projectId: string | number}) {
    this.projectId = init.projectId;
  }

  public getMergeRequest(iid: string | number): Promise<MergeRequest> {
    return GitlabReq.get('/projects/' + this.projectId + '/merge_requests/' + iid + '?include_rebase_in_progress=true').then(mr => new MergeRequest(mr));
  }

  public updateMergeRequest(mr: MergeRequest): Promise<MergeRequest> {
    return GitlabReq.put('/projects/' + this.projectId + '/merge_requests/' + mr.iid, mr);
  }

  // TODO proper param handling :(
  getMergeRequests(param: { state: string; label: string; wip: string } = {state: 'opened', label: 'merge_train', wip: 'no'}): Promise<MergeRequest[]> {
    return GitlabReq.get('/projects/' + this.projectId + '/merge_requests?labels=' + param.label + '&scope=all&state=' + param.state + '&wip=' + param.wip)
      .then(mrs => mrs.map(mrs2 => new MergeRequest(mrs2)));
  }

  getPipelinesByMR(iid: number | string): Promise<Pipeline[]> {
    return GitlabReq.get('/projects/' + this.projectId + '/merge_requests/' + iid + '/pipelines');
  }

  async commentMergeRequest(mr: MergeRequest, text: string, updateId?: number | string): Promise<{id: string|number}> {
    const note = {body: text};
    if (updateId) {
      let note = await GitlabReq.get('/projects/' + this.projectId + '/merge_requests/' + mr.iid + '/notes/' + updateId);
      note.body = note.body + '\n- ' + text;
      return await GitlabReq.put('/projects/' + this.projectId + '/merge_requests/' + mr.iid + '/notes'  + (updateId ? '/' + updateId : ''), note);
    }
    return await GitlabReq.post( '/projects/' + this.projectId + '/merge_requests/' + mr.iid + '/notes', note);
  }

  public pollMergeRequest(iid: number|string, opt: PollSettings = this.defaultPollSettings): Observable<PollStatus<MergeRequest>> {
    let count = 0;
    return timer(0, opt.interval).pipe(
      tap(() => {
        count++;
        if ((count * opt.interval > opt.timeout) && (opt.runAtLeast <= count))
          throw new PollTimeout('Timeout while polling merge requests. ' + count * opt.interval + ' exceeded timeout of ' + opt.timeout);
      }),
      concatMap(() => this.getMergeRequest(iid)),
      map(rebaseResp => new PollStatus<MergeRequest>(null, count * opt.interval, rebaseResp))
    );
  }

  public getPipeline(id: string | number): Promise<Pipeline> {
    return GitlabReq.get('/projects/' + this.projectId + '/pipelines/' + id).then(p => new Pipeline(p));
  }

  public pollMRPipelines(iid: number | string, opt: PollSettings = this.defaultPollSettings): Observable<PollStatus<Pipeline[]>> {
    let count = 0;
    return timer(0, opt.interval).pipe(
      tap(() => {
        count++;
        if ((count * opt.interval > opt.timeout) && (opt.runAtLeast <= count))
          throw new PollTimeout('Timeout while polling for MR pipeline. ' + count * opt.interval + ' exceeded timeout of ' + opt.timeout);
      }),
      concatMap(() => this.getPipelinesByMR(iid).then(pipelines => Promise.all(pipelines.map(pipeline => this.getPipeline(pipeline.id))))),
      map(resp => new PollStatus<Pipeline[]>(null, count * opt.interval, resp))
    );
  }

  public cancelPipeline(id: number | string) {
    return GitlabReq.post('/projects/' + this.projectId + '/pipelines/' + id + '/cancel', null);
  }

  public deletePipeline(id: number | string) {
    return GitlabReq.del('/projects/' + this.projectId + '/pipelines/' + id);
  }

  rebaseMR(iid: number | string) {
    return GitlabReq.put( '/projects/' + this.projectId + '/merge_requests/' + iid + '/rebase', null);
  }

  mergeWPS(iid: number) {
    return GitlabReq.put('/projects/' + this.projectId + '/merge_requests/' + iid + '/merge?merge_when_pipeline_succeeds=true&should_remove_source_branch=true', null);
  }
}
