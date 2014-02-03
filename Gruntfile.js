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
                tasks: ['jshint', 'mochacov']
            },
            test: {
                files: testFiles,
                tasks: ['mochacov']
            }
        },
        jshint: {
            files: files
        },
        mochacov: {
            options: {
                reporter: 'spec'
            },
            all: ['test/*Spec.js']
        }
    });

    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-mocha-cov');

    grunt.registerTask('default', ['jshint']);

    grunt.registerTask('test', ['mochacov']);

};