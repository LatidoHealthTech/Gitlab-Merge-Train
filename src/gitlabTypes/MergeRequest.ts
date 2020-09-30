 export interface Author {
    id: number;
    name: string;
    username: string;
    state: string;
    avatar_url?: any;
    web_url: string;
  }

  export interface Assignee {
    id: number;
    name: string;
    username: string;
    state: string;
    avatar_url?: any;
    web_url: string;
  }

  export interface Milestone {
    id: number;
    iid: number;
    project_id: number;
    title: string;
    description: string;
    state: string;
    created_at: Date;
    updated_at: Date;
    due_date: string;
    start_date: string;
    web_url: string;
  }

  export interface References {
    short: string;
    relative: string;
    full: string;
  }

  export interface TimeStats {
    time_estimate: number;
    total_time_spent: number;
    human_time_estimate?: any;
    human_total_time_spent?: any;
  }

  export interface MergedBy {
    id: number;
    name: string;
    username: string;
    state: string;
    avatar_url: string;
    web_url: string;
  }

  export interface Pipeline {
    id: number;
    sha: string;
    ref: string;
    status: string;
    web_url: string;
  }

  export interface DiffRefs {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  }

  export interface TaskCompletionStatus {
    count: number;
    completed_count: number;
  }

  export class MergeRequest {
    id: number;
    iid: number;
    target_branch: string;
    project_id: number;
    title: string;
    description: string;
    state: string;
    rebase_in_progress: boolean;
    labels: string[];
    work_in_progress: boolean;
    merge_when_pipeline_succeeds: boolean;
    merge_status: string;
    merge_error?: any;
    squash_commit_sha?: any;
    should_remove_source_branch: boolean;
    force_remove_source_branch: boolean;
    web_url: string;
    pipeline: Pipeline;

    constructor(init: Partial<Pipeline> = {}) {
      Object.assign(this, init);
    }

    toString() {
      return this.title + ' [' + this.state + '] (' + this.web_url + ')';
    }
  }



