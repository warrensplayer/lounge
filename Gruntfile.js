var files = [
        'lib/**/*.js'
    ],
    testFiles = [
        'test/*Spec.js'
    ];

module.exports = function(grunt) {

    grunt.initConfig({
        watch: {
            lounge: {
                files: files,
                tasks: ['jshint', 'mochacov:test']
            },
            test: {
                files: testFiles,
                tasks: ['mochacov:test']
            }
        },
        jshint: {
            files: files
        },
        mochacov: {
            options: {
                files: ['test/*Spec.js']
            },
            coverage: {
              options: {
                coveralls: true
              }
            },
            test: {
                options: {
                    reporter: 'spec'
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-mocha-cov');

    grunt.registerTask('default', ['jshint']);

    grunt.registerTask('test', ['mochacov:test']);

};