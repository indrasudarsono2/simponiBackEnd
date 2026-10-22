import test, { after } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='mysql://test:test@127.0.0.1:1/test';
const { default: prisma }=await import('../lib/prisma.js');
const { readAdminExaminationActivity }=await import('../controller/examinationActivityController.js');
const { enforceRoutePolicy }=await import('../middleware/routePolicy.js');
after(()=>prisma.$disconnect());
const units=[{id:1,unit:'A',branchId:10,branch:{id:10,branch:'First'}},{id:2,unit:'B',branchId:10,branch:{id:10,branch:'First'}},{id:3,unit:'C',branchId:20,branch:{id:20,branch:'Second'}}];
const users={general:{roleNames:['GENERAL ADMIN'],menuNames:['dashboardGeneralAdmin']},branch:{roleNames:['BRANCH ADMIN'],menuNames:['dashboardBranchAdmin'],branchId:10},unit:{roleNames:['BRANCH UNIT ADMIN'],menuNames:['dashboardBranchUnitAdmin'],branchUnitId:2}};
function database(){
 const seen=[];
 const client={branchUnit:{findMany:async({where})=>units.filter(u=>(!where.id||u.id===where.id)&&(!where.branchId||u.branchId===where.branchId))},
  modeOneExamDraft:{findMany:async q=>{seen.push(q);return []},count:async()=>0},
  theorySessionParticipant:{findMany:async q=>{seen.push(q);return []},count:async()=>0}};
 return {client,seen};
}
test('general admin sees all branches and can filter branch; pagination remains scoped',async()=>{
 const {client,seen}=database();
 const all=await readAdminExaminationActivity(client,users.general,{scope:'general'});
 assert.equal(all.branches.length,2);assert.deepEqual(seen[0].where.appRating.applicationDoc.user.branchUnitId,{in:[1,2,3]});
 assert.equal(seen[0].select.answers,undefined);assert.equal(seen[1].select.essayAnswers,undefined);
 seen.length=0;
 await readAdminExaminationActivity(client,users.general,{scope:'general',branchId:'20',page:'1'});
 assert.deepEqual(seen[0].where.appRating.applicationDoc.user.branchUnitId,{in:[3]});assert.equal(seen[0].skip,100);
});
test('branch admin sees only own branch units and can narrow to one',async()=>{
 const {client,seen}=database();
 const result=await readAdminExaminationActivity(client,users.branch,{scope:'branch',branchUnitId:'2'});
 assert.deepEqual(result.branchUnits.map(u=>u.id),[1,2]);assert.deepEqual(seen[0].where.appRating.applicationDoc.user.branchUnitId,{in:[2]});
 await assert.rejects(readAdminExaminationActivity(client,users.branch,{scope:'branch',branchId:'20'}),{status:403});
 await assert.rejects(readAdminExaminationActivity(client,users.branch,{scope:'branch',branchUnitId:'3'}),{status:403});
});
test('snapshot loads all authorized attempt metadata without pagination or answers', async () => {
 const {client,seen}=database();
 const result=await readAdminExaminationActivity(client,users.general,{scope:'general',snapshot:'true'});
 for(const query of seen){ assert.equal(query.skip,undefined);assert.equal(query.take,undefined); }
 assert.equal(seen[0].select.answers,undefined);
 assert.equal(seen[1].select.essayAnswers,undefined);
 assert.deepEqual(seen[0].where.appRating.applicationDoc.user.branchUnitId,{in:[1,2,3]});
 assert.equal(result.hasNext,false);
 assert.equal(result.truncated,false);
 const branchSnapshot=database();
 await readAdminExaminationActivity(branchSnapshot.client,users.branch,{scope:'branch',snapshot:'true'});
 assert.deepEqual(branchSnapshot.seen[0].where.appRating.applicationDoc.user.branchUnitId,{in:[1,2]});
 assert.equal(branchSnapshot.seen[0].take,undefined);
 const scoped=database();
 await readAdminExaminationActivity(scoped.client,users.unit,{scope:'unit',snapshot:'true'});
 assert.deepEqual(scoped.seen[0].where.appRating.applicationDoc.user.branchUnitId,{in:[2]});
});
test('unit admin cannot broaden scope, spoof parent branch, or use general dashboard',async()=>{
 const {client,seen}=database();await readAdminExaminationActivity(client,users.unit,{scope:'unit'});
 assert.deepEqual(seen[0].where.appRating.applicationDoc.user.branchUnitId,{in:[2]});
 for(const query of [{scope:'unit',branchUnitId:'1'},{scope:'unit',branchId:'20'},{scope:'general'}]) await assert.rejects(readAdminExaminationActivity(client,users.unit,query),{status:403});
 await assert.rejects(readAdminExaminationActivity(client,{...users.branch,branchId:null},{scope:'branch'}),{status:403});
 await assert.rejects(readAdminExaminationActivity(client,{...users.general,menuNames:[]},{scope:'general'}),{status:403});
  await assert.rejects(readAdminExaminationActivity(client,users.branch,{scope:['branch']}),{status:403});
});
test('invalid filters fail closed and Operational has no monitor route access',async()=>{
 const {client}=database();for(const query of [{scope:'general',page:'-1'},{scope:'general',branchId:'abc'},{scope:'general',branchId:['20']},{scope:'general',page:['1']}]) await assert.rejects(readAdminExaminationActivity(client,users.general,query),{status:400});
 let allowed=false;let code;
 enforceRoutePolicy({path:'/adminExaminationActivity',method:'GET',user:{roleNames:['OPERATIONAL'],menuNames:['dashboardGeneralAdmin']}},{status(n){code=n;return this},json(){}},()=>allowed=true);
 assert.equal(allowed,false);assert.equal(code,403);
});
