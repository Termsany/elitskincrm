type TaskState={status:string;due_date?:string|null;assignees?:Array<{user_id:string;status:string}>};
export function personalTask<T extends TaskState>(task:T,userId:string,isAdmin:boolean):T{
 return {...task,status:isAdmin?task.status:task.assignees?.find(a=>a.user_id===userId)?.status??task.status};
}
export function isTaskOverdue(task:TaskState,today:string):boolean{
 return Boolean(task.due_date&&task.due_date.slice(0,10)<today&&["pending","in_progress"].includes(task.status));
}
