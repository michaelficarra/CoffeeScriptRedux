process.stdout.write 'test -v ok' if process.argv[2] is '-v'
process.stdout.write 'test -r ok' if process.argv[2] is '-r'
