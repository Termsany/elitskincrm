import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
describe('rep reset target preview',()=>{
 it('shows detailed sales, distribution rows and a protected-version blocker before destructive confirmation',()=>{
  const source=readFileSync('src/app/admin/rep/[id]/RepLifecycleActions.tsx','utf8');
  for(const field of ['forecastSales','targetYears','targetVersions','targetMonths','targetLines','targetOverrides','forecastLateExceptions'])expect(source).toContain(field);
  expect(source).toContain('setBlocker(j.blocker||null)');
  expect(source).toContain('disabled={busy||!!blocker||enteredName!==name');
  expect(source).toContain('{blocker&&<p role="alert"');
 });
});
