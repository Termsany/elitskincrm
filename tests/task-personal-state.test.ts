import {expect,it} from "vitest";
import {personalTask,isTaskOverdue} from "@/lib/task-personal-state";
const task={status:"in_progress",due_date:"2026-10-24",assignees:[{user_id:"one",status:"completed"},{user_id:"two",status:"pending"}]};
it("uses my assignment not team status",()=>{expect(personalTask(task,"one",false).status).toBe("completed");expect(personalTask(task,"two",false).status).toBe("pending");});
it("preserves admin team status",()=>expect(personalTask(task,"one",true).status).toBe("in_progress"));
it("does not flag completed personal tasks overdue",()=>expect(isTaskOverdue(personalTask(task,"one",false),"2026-10-25")).toBe(false));
it("flags outstanding tasks before today only",()=>{expect(isTaskOverdue(task,"2026-10-25")).toBe(true);expect(isTaskOverdue(task,"2026-10-24")).toBe(false);});
