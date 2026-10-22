import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryMatsCounts, matchesCategoryMatsCounts} from '../utils/matsSelection.js';
test('category selection must match every configured category, not just the overall count', () => {
 const expected=categoryMatsCounts({allocations:[{mandatoryItemId:1,quantity:2},{mandatoryItemId:2,quantity:1},{mandatoryItemId:3,quantity:5}]},[{mandatoryItemId:1},{mandatoryItemId:2}]);
 assert.equal(matchesCategoryMatsCounts([{mandatoryItemId:1},{mandatoryItemId:1},{mandatoryItemId:2}],expected),true);
 for(const selections of [[],[{mandatoryItemId:1},{mandatoryItemId:2}],[{mandatoryItemId:1},{mandatoryItemId:2},{mandatoryItemId:2}],[{mandatoryItemId:1},{mandatoryItemId:1},{mandatoryItemId:3}]]) assert.equal(matchesCategoryMatsCounts(selections,expected),false);
});
