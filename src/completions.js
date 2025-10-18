/**
 * Shell completion generators
 * Generates bash and zsh completion scripts for vcluster-yaml CLI
 */

/**
 * Generate bash completion script
 * @returns {string} Bash completion script
 */
export function generateBashCompletion() {
  return `# vcluster-yaml bash completion

_vcluster_yaml_completions() {
    local cur prev words cword
    _init_completion || return

    # Available commands
    local commands="query list-versions validate help"

    # Available format options
    local formats="json yaml table"

    case "\${cword}" in
        1)
            # First argument: complete commands
            COMPREPLY=($(compgen -W "\${commands}" -- "\${cur}"))
            return 0
            ;;
        *)
            # Handle options based on previous word
            case "\${prev}" in
                -f|--format)
                    # Complete format options
                    COMPREPLY=($(compgen -W "\${formats}" -- "\${cur}"))
                    return 0
                    ;;
                -s|--schema-version)
                    # Complete common versions (user can type others)
                    COMPREPLY=($(compgen -W "main v0.28.0 v0.29.0 v0.30.0" -- "\${cur}"))
                    return 0
                    ;;
                --file)
                    # Complete YAML files
                    COMPREPLY=($(compgen -f -X '!*.yaml' -- "\${cur}"))
                    COMPREPLY+=($(compgen -f -X '!*.yml' -- "\${cur}"))
                    return 0
                    ;;
                validate)
                    # After validate command, complete YAML files or options
                    if [[ "\${cur}" == -* ]]; then
                        COMPREPLY=($(compgen -W "-s --schema-version -f --format -h --help" -- "\${cur}"))
                    else
                        COMPREPLY=($(compgen -f -X '!*.yaml' -- "\${cur}"))
                        COMPREPLY+=($(compgen -f -X '!*.yml' -- "\${cur}"))
                        [[ "\${cur}" == "" || "\${cur}" == "-" ]] && COMPREPLY+=("-")
                    fi
                    return 0
                    ;;
                query)
                    # After query command, complete options
                    if [[ "\${cur}" == -* ]]; then
                        COMPREPLY=($(compgen -W "--file -s --schema-version -f --format -h --help" -- "\${cur}"))
                    fi
                    return 0
                    ;;
                list-versions)
                    # After list-versions command, complete options
                    COMPREPLY=($(compgen -W "-f --format -h --help" -- "\${cur}"))
                    return 0
                    ;;
            esac
            ;;
    esac

    # Default: suggest options if starting with -
    if [[ "\${cur}" == -* ]]; then
        COMPREPLY=($(compgen -W "-V --version -h --help" -- "\${cur}"))
        return 0
    fi
}

complete -F _vcluster_yaml_completions vcluster-yaml
`;
}

/**
 * Generate zsh completion script
 * @returns {string} Zsh completion script
 */
export function generateZshCompletion() {
  return `#compdef vcluster-yaml

# vcluster-yaml zsh completion

_vcluster_yaml() {
    local -a commands
    commands=(
        'query:Search for vCluster configuration fields'
        'list-versions:List available vCluster versions'
        'validate:Validate vCluster configuration'
        'help:Display help for command'
    )

    local -a formats
    formats=(
        'json:JSON output format'
        'yaml:YAML output format'
        'table:Table output format'
    )

    local -a versions
    versions=(
        'main:Latest development version'
        'v0.28.0:Version 0.28.0'
        'v0.29.0:Version 0.29.0'
        'v0.30.0:Version 0.30.0'
    )

    _arguments -C \\
        '(-V --version)'{-V,--version}'[output the version number]' \\
        '(-h --help)'{-h,--help}'[display help for command]' \\
        '1: :->command' \\
        '*:: :->args'

    case $state in
        command)
            _describe 'vcluster-yaml commands' commands
            ;;
        args)
            case $words[1] in
                query)
                    _arguments \\
                        '--file[Configuration file to search]:file:_files -g "*.yaml *.yml"' \\
                        '(-s --schema-version)'{-s,--schema-version}'[vCluster version or branch]:version:->versions' \\
                        '(-f --format)'{-f,--format}'[Output format]:format:->formats' \\
                        '(-h --help)'{-h,--help}'[display help]' \\
                        '1:query string:'

                    case $state in
                        formats)
                            _describe 'output formats' formats
                            ;;
                        versions)
                            _describe 'vCluster versions' versions
                            ;;
                    esac
                    ;;
                list-versions)
                    _arguments \\
                        '(-f --format)'{-f,--format}'[Output format]:format:->formats' \\
                        '(-h --help)'{-h,--help}'[display help]'

                    case $state in
                        formats)
                            _describe 'output formats' formats
                            ;;
                    esac
                    ;;
                validate)
                    _arguments \\
                        '(-s --schema-version)'{-s,--schema-version}'[vCluster version for schema]:version:->versions' \\
                        '(-f --format)'{-f,--format}'[Output format]:format:->formats' \\
                        '(-h --help)'{-h,--help}'[display help]' \\
                        '1:file:_files -g "*.yaml *.yml"'

                    case $state in
                        formats)
                            _describe 'output formats' formats
                            ;;
                        versions)
                            _describe 'vCluster versions' versions
                            ;;
                    esac
                    ;;
                help)
                    _describe 'vcluster-yaml commands' commands
                    ;;
            esac
            ;;
    esac
}

_vcluster_yaml "$@"
`;
}

/**
 * Display installation instructions for a shell
 * @param {string} shell - Shell type (bash or zsh)
 * @returns {string} Installation instructions
 */
export function getInstallInstructions(shell) {
  if (shell === 'bash') {
    return `
Bash Completion Installation:

1. Save the completion script:
   $ vcluster-yaml completion bash > ~/.vcluster-yaml-completion.bash

2. Source it in your ~/.bashrc:
   $ echo 'source ~/.vcluster-yaml-completion.bash' >> ~/.bashrc

3. Reload your shell:
   $ source ~/.bashrc

Or install system-wide (requires sudo):
   $ sudo vcluster-yaml completion bash > /etc/bash_completion.d/vcluster-yaml
`;
  }

  if (shell === 'zsh') {
    return `
Zsh Completion Installation:

1. Create completion directory if needed:
   $ mkdir -p ~/.zsh/completion

2. Save the completion script:
   $ vcluster-yaml completion zsh > ~/.zsh/completion/_vcluster-yaml

3. Add to fpath in your ~/.zshrc (before compinit):
   fpath=(~/.zsh/completion $fpath)
   autoload -Uz compinit && compinit

4. Reload your shell:
   $ exec zsh

Or install system-wide (requires sudo):
   $ sudo vcluster-yaml completion zsh > /usr/local/share/zsh/site-functions/_vcluster-yaml
`;
  }

  return 'Unsupported shell. Available: bash, zsh';
}
