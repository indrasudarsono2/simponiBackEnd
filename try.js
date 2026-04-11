const array = [
  {
    rating: { id: '6', rating: 'ACP' },
    controlHour: '66',
    checkerGroupId: [ '20', '21' ]
  },
  {
    rating: { id: '7', rating: 'ACS' },
    controlHour: '88',
    checkerGroupId: [ '20' ]
  }
]

const find = array.find(d => d.rating.id === '6')
console.log(find);