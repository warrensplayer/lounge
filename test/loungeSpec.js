var expect = require('expect.js');

describe('Lounge', function() {

    it('should export a run method', function() {
        var config = {
            version: '0.0.1',
            couch_url: 'http://couch.dev'
        };
        var lounge = require('..')(config);
        expect(lounge.run).to.be.ok();
    });


});