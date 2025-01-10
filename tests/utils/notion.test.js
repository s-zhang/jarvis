import { flattenFilter } from '../../utils/notion.js';

describe('flattenFilter', () => {
  it('should leave as is if fewer or equal than 2 levels of and/or', () => {
    const filter = {
      and: [
        {
          or: [
            { property: 'Priority', select: { equals: 'High' } },
            { property: 'Priority', select: { equals: 'Medium' } }
          ]
        },
        {
          or: [
            { property: 'Status', select: { equals: 'To-do' } },
            { property: 'Status', select: { equals: 'In progress' } }
          ]
        }
      ]
    };

    expect(flattenFilter(filter)).toEqual(filter);
  });

  it('should return the same filter if no and/or present', () => {
    const filter = { property: 'Priority', select: { equals: 'High' } };
    expect(flattenFilter(filter)).toEqual(filter);
  });
});