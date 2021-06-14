/*
 * SPDX-FileCopyrightText: 2021 Thorsten Hapke <thorsten.hapke@sap.com>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

var Generator = require('yeoman-generator');
var memFs = require("mem-fs");
var editor = require("mem-fs-editor");
var path = require("path");
var mkdirp = require('mkdirp')
const fs = require('fs');


// GLOBAL Variables
const vflow_operators_path = '/files/vflow/subengines/com/sap/python36/operators/';
const exclude_list = ['.git','.gitignore','LICENSE','README.md'];

//VCTL LOGIN
function _vctl_login(gen,di_url,tenant,user,pwd) {
  const vctl_login = ['login',di_url,tenant,user,'-p',pwd];
  gen.spawnCommandSync('vctl',vctl_login);
};

//VCTL LS
function _vctl_ls(gen,op_package) {
  let package_path = ''
  if (op_package == '.') {
    package_path = path.join(vflow_operators_path)
  }
  else {
    let operator_path = op_package.replace('.','/')
    package_path = path.join(vflow_operators_path,operator_path)
  };
  // call vctl
  const vctl_ls = ['vrep','user','ls',package_path];
  const vctl_ls_out = gen.spawnCommandSync('vctl',vctl_ls,{ stdio: [process.stdout] });
  let file_list = vctl_ls_out.stdout.split("\n");

  // extract list without exclusions
  let files = []
  file_list.forEach(function(item){
    let f = item.trim()
    if (exclude_list.includes(f) == false) {
      files.push(f);
    };
  });
  return files;
};  

// Mkdir VCTL file
function _vctl_mkdir(gen,path) {
  const vctl_mkdir = ['vrep','user','mkdir',path];
  gen.spawnCommandSync('vctl',vctl_mkdir);
};

// Read VCTL file
function _vctl_read(gen,operator_path) {
  const vctl_cat = ['vrep','user','cat',operator_path];
  const vctl_cat_out = gen.spawnCommandSync('vctl',vctl_cat,{stdio: [process.stdout] });
  return vctl_cat_out.stdout
};

// Put VCTL file
function _vctl_put(gen,source_path,operator_path) {
  const vctl_put = ['vrep','user','put',source_path,operator_path];
  gen.spawnCommandSync('vctl',vctl_put);
};



/*
 * Generator
*/
module.exports = class extends Generator {

  constructor(args,opts) {
    super(args,opts);

    //this.argument("init",{type: String,desc:'Initialize project by copying necessary files. Attention: overrides changed files!'})
    this.option("init",{type: Boolean,default:false,desc:'Initialize project by copying necessary files. Attention: overrides changed files!'});
    this.option("overwrite",{type: Boolean,default:false,desc:'Creating new script.py and script_test.py. OVERRIDES downloaded script-files!'});
    this.files_content = {};
    this.operator_dir = '';

  }
  
  async prompting() {
    this.answers = await this.prompt([
      {
        type: 'list',
        name: 'direction',
        message: 'Download or Upload operator',
        default: 'D',
        choices: [
          {
            name: 'Download',
            value: 'D',
          }, {
            name: 'Upload',
            value: 'U'
          }
        ]
      },
      {
        type: "input",
        name: "di_url",
        message: "SAP Data Intelligence URL",
        store: true // Default to current folder name
      },
      {
        type: "input",
        name: "tenant",
        message: "Tenant",
        default: "default",
        store: true
      },
      {
        type: "input",
        name: "user",
        message: "User",
        store: true
      },
      {
        type: "password",
        name: "pwd",
        message: "Password",
        store: true
      },
      {
        type: "input",
        name: "operator",
        message: "Operator",
        store: true
      }
    ]);

    //this.answers.direction = this.answers.direction.toUpperCase();
    this.operator_dir = this.answers.operator.replace('.','/');
    this.package_name = this.answers.operator.split('.')[0];
    this.operator_name = this.answers.operator.split('.')[1];
    this.log('Package: ' + this.package_name + '   Operator: ' + this.operator_name);

    //login
    this.log('Login into SAP Data Intelligence')
    _vctl_login(this,this.answers.di_url,this.answers.tenant,this.answers.user,this.answers.pwd);

    if (this.answers.direction =='D') {
      this.log('***** Download *****');
      // List all files in operator folder
      let files = _vctl_ls(this,this.answers.operator);
      //this.log('All files in \''+this.answers.operator+'\'-directory: ' + files)

      // copy files 
      for (let f = 0; f < files.length; f++ ) {
        // Download file and add to files_content dict
        let operator_path = path.join(vflow_operators_path,this.operator_dir,files[f]);
        this.log('Read file from SAP DI: ' + files[f] );
        this.files_content[files[f]] = _vctl_read(this,operator_path);
        this.log('Sucessfully downloaded');
      };
      this.log('All files read')
    };
  };

  /*
  * Change operator name
  * - When copying an operator configSchema.json and operator.json has been adjusted as well 
  */
  _adjustOperatorName() {
    this.log('Adjust Operator Name');
    /*** operator.json ***/
    let operator_path = path.join(this.destinationRoot(),'operators',this.package_name,this.operator_name);
    let operator_json_raw = fs.readFileSync(path.join(operator_path,'operator.json'),'utf8');
    let operator_json = JSON.parse(operator_json_raw);
    operator_json['description'] = this.operator_name.charAt(0).toUpperCase() + this.operator_name.slice(1);
    operator_json['config']['$tpye'] = 'http://sap.com/vflow/'+this.package_name+'.'+this.operator_name+'.configSchema.json';
    fs.writeFileSync(path.join(operator_path,'operator.json'), JSON.stringify(operator_json,null, 4));

    /*** configSchema.json ***/
    let schema_json_raw = fs.readFileSync(path.join(operator_path,'configSchema.json'),'utf8');
    let schema_json = JSON.parse(schema_json_raw);
    schema_json['$id'] = "http://sap.com/vflow/" + this.package_name + '.' + this.operator_name + '.configSchema.json';
    fs.writeFileSync(path.join(operator_path,'configSchema.json'), JSON.stringify(schema_json,null, 4));
  };
  
  writing() {

    /*
     *  Initializes Poject option --init
    */
    if (this.options.init) {
      this.log('Initializes project.')
      // make testdata directory
      mkdirp.sync(path.join(this.destinationRoot(),'operators'));
      // copying the mock_di_api and operator_test to utils
      this.fs.copy(this.templatePath('mock_di_api.py'),this.destinationPath('utils/mock_di_api.py'));
      this.fs.copy(this.templatePath('operator_test.py'),this.destinationPath('utils/operator_test.py'));
      // make testdata directory
      mkdirp.sync(path.join(this.destinationRoot(),'testdata'));
    };

    let import_mock_api = `# First 3 lines generated by di-pyoperator - DO NOT CHANGE (Deleted again when uploaded.)
from utils.mock_di_api import mock_api
api = mock_api(__file__)
`
    this.log('Start scaffolding');
    /******
     *  Download files from DI
    ******/
    if (this.answers.direction == 'D') {
      this.log('Prepare for saving data')
      let config_att = JSON.parse(this.files_content['configSchema.json']);
      let op_att = JSON.parse(this.files_content['operator.json']);
      let script_file = '';
      if (op_att['config']['script'].match(/^file:\/\//)) {
        script_file = op_att['config']['script'].slice(7);
        this.log('Script file: '+script_file )
      } else {
        // extract inline code and change operator.json
        script_file = 'script.py';
        this.files_content[script_file] = op_att['config']['script'];
        op_att['config']['script'] = 'file://script.py';
        this.log(JSON.stringify(op_att));
        this.files_content['operator.json'] = JSON.stringify(op_att, null, 2);
      }
      //this.log('Root: ' + this.destinationRoot())
      let dest_path = path.join(this.destinationRoot(),'operators',this.operator_dir);
      this.log('Target directory: ' + dest_path);
      mkdirp(dest_path);

      let num_inports = 0 ;
      if (('inports' in op_att))  {
        num_inports = op_att['inports'].length;
      }
      this.log('Number of inports: ' + num_inports);

      /*
      * Config parameter
      */  
      let config_params= '# config parameter \n' ;
      let config_params_indent = '    ' + config_params;
      for (let [param,pvalues] of Object.entries(config_att['properties'])) {
        //this.log('param: ' + param);
        if (param !== 'script' && param !== 'codelanguage' ) {
          let param_type = '   # datatype : ' + config_att['properties'][param]['type'] + '\n';
          let param_str = '';
          if (param in op_att['config']) {
            let value = op_att['config'][param]
            switch (config_att['properties'][param]['type']) {
              case "integer":
                param_str =  'api.config.' + param + ' = ' + value + param_type; 
                break;
              case "string":
                param_str =  'api.config.' + param + ' = \'' + value + '\' ' + param_type; 
                break;
              case "array":
                let arrvalue = "'" + value.join("','") + "'";
                param_str =  'api.config.' + param + ' = [' + arrvalue + '] ' + param_type; 
                break;
              default: 
                param_str =  'api.config.' + param + ' = \'' + value + '\' ' + param_type; 
            };  
          } else {
            param_str =  'api.config.' + param + ' = ' + 'None' + param_type
          }
          config_params += param_str;
          config_params_indent += '    #' + param_str;
        };
      };

      /***************** 
       * python script
      *****************/
      if (((script_file in this.files_content) === false) || (this.files_content[script_file].length<5) || (this.options.overwrite) ) {
        /*
        * NEW python script
        */
        if (this.options.overwrite) {
          this.log('Script-files created newly and overwrites downloaded!');
        } else {
            this.log('Script file not found: ' + script_file + '  -> New scriptfile created! ');
        }
        // import mock-di-api
        let script_content = import_mock_api + '\n';

        script_content += 'import pandas as pd\n';
        script_content += 'import copy\n';
        for (let ip = 0; ip < num_inports; ip++) {
          if (op_att['inports'][ip]['type']=='message.file') {
            script_content += 'import io\n';
          }
        }
        for (let op = 0; op < op_att['outports'].length; op++) {
          if (op_att['outports'][op]['type']=='message.file') {
            script_content += 'import os\n';
          }
        }
        script_content += '\n\n';


        if (('inports' in op_att) === false || num_inports == 0) {
          // GENERATOR
          let call_func = 'gen()';

          script_content += 'def gen() :\n\n';
          script_content += config_params_indent + '\n\n';

          // api.send for each outport
          for (let op = 0; op < op_att['outports'].length; op++) {
            if (op_att['outports'][op]['type'] == 'message.table') {
              script_content += `
    # Sending to outport ${op_att['outports'][op]['name']}
    # Due to output-format PROPOSED transformation into message.table
    df = pd.DataFrame(data={'col1': [1, 2], 'col2': ['ab', 'cd']})
    #df.columns = map(str.upper, df.columns)  # for saving to DB upper case is usual
    columns = []
    for col in df.columns : 
        columns.append({"class": str(df[col].dtype),\'name\': col})
    att = {'operator':'generator',\'table\':{\'columns\':columns,\'name\':\'TABLE\',\'version\':1}
    out_msg = api.Message(attributes=att, body= df.values.tolist())
`
            } else if (op_att['outports'][op]['type'] == 'message.file') {
                script_content += `
    # Sending to outport ${op_att['outports'][op]['name']}
    csv = df.to_csv(index=False)
    att = {'operator':'generator','file' : {"connection": {"configurationType": "Connection Management", "connectionID": "DI_DATA_LAKE" },\\
                   "path": "/shared/data.csv", "size": 1}}
    out_msg = api.Message(attributes=att,body=csv)
`
            }  if (op_att['inports'][ip]['type'] == 'message') {
                script_content += `
    # Sending to outport ${op_att['outports'][op]['name']}
    att = {'operator':'generator'}
    out_msg = api.Message(attributes=att,body=None)
`
            } else {
                script_content += `
    out_msg = None
`
              }
          }
          script_content += 'api.add_generator(gen)';
        } else {
          // CALLBACK
          for (let ip = 0; ip < num_inports; ip++) {
            let call_func = 'on_'+op_att['inports'][ip]['name']+'(msg)';
            script_content += 'def ' + call_func+' :\n\n';
            // inport message.table
            if (op_att['inports'][ip]['type'] == 'message.table') {
              script_content += '    # Due to input-format PROPOSED transformation into DataFrame\n'
              script_content += '    header = [c[\'name\'] for c in msg.attributes[\'table\'][\'columns\']]\n';
              script_content += '    df = pd.DataFrame(msg.body, columns=header)\n\n';
            } 
            // inport message.file
            else if (op_att['inports'][ip]['type'] == 'message.file') {
              script_content += '    # Due to input-format PROPOSED transformation into DataFrame\n'
              script_content += '    df = pd.read_csv(io.BytesIO(msg.body))\n\n';
            }
            else if (op_att['inports'][ip]['type'] == 'message') {
              script_content += '    # Assumingly the message.body is of type DataFrame\n'
              script_content += '    df = msg.body\n\n';
            }
            
            script_content += config_params_indent + '\n\n';

            // api.send for each outport
            for (let op = 0; op < op_att['outports'].length; op++) {
              if (op_att['outports'][op]['type'] == 'message.table') {
                script_content += `
    # Sending to outport ${op_att['outports'][op]['name']}
    # Due to output-format PROPOSED transformation into message.table
    #df.columns = map(str.upper, df.columns)  # for saving to DB upper case is usual
    columns = []
    for col in df.columns : 
        columns.append({"class": str(df[col].dtype),\'name\': col})
    att = copy.deepcopy(msg.attributes)
    att['table'] = {'columns':columns,'name':'TABLE','version':1}
    out_msg = api.Message(attributes=att, body= df.values.tolist())
`
              } else if (op_att['outports'][op]['type'] == 'message.file') {
                script_content += `
    # Sending to outport ${op_att['outports'][op]['name']}
    csv = df.to_csv(index=False)
    att = copy.deepcopy(msg.attributes)
    att['file'] = {"connection": {"configurationType": "Connection Management", "connectionID": "DI_DATA_LAKE" },\\
                   "path": "/shared/data.csv", "size": 1}
    out_msg = api.Message(attributes=att,body=csv)
`
              }  else if (op_att['outports'][op]['type'] == 'message') {
                script_content += `
    # Sending to outport ${op_att['outports'][op]['name']}
    att = copy.deepcopy(msg.attributes)
    out_msg = api.Message(attributes=att,body=None)
`
              } else {
                script_content += `
    out_msg = None
    `
              }
              let op_datatype = '    # datatype: ' + op_att['outports'][op]['type'] + '\n\n';
              script_content += '    api.send(\''+op_att['outports'][op]['name']+'\',out_msg)' + op_datatype; 
            }
            let ip_datatype = ')   # datatype: ' + op_att['inports'][ip]['type'] + '\n\n';  
            script_content += 'api.set_port_callback(\''+op_att['inports'][ip]['name']+'\',on_'+op_att['inports'][ip]['name']+ip_datatype;
          }
        };
        this.files_content[script_file] = script_content;

      } else { 
        /*
        * ADJUST python script
        */ 
        this.log('Adjust script file: '+ script_file);
        //  MOCK_DI_API
        this.files_content[script_file] = import_mock_api +  this.files_content[script_file];
      }

      /************* 
       * script_test
      **************/ 
      let script_test = script_file.slice(0,-3) + '_test.py' 
      let script_test_content = '';
      if (((script_test in this.files_content)===false) || (this.options.overwrite)) {
        this.log('Create new test script: ' + script_test);
        script_test_content = `import ${script_file.slice(0,-3)}
from utils.mock_di_api import mock_api
from utils.operator_test import operator_test
        
api = mock_api(__file__)     # class instance of mock_api
mock_api.print_send_msg = True  # set class variable for printing api.send

optest = operator_test(__file__)
`;

        script_test_content += config_params + '\n\n';
        if (num_inports > 0 )  {
          for (let ip = 0; ip < num_inports; ip++) {
            let idx = ip.toString();
            if (idx == '0') {idx=''};
            if (op_att['inports'][ip]['type'] == 'message.file') {
              script_test_content += 'msg'+idx+' = optest.get_msgfile(\'test_file'+idx+'.csv\')\n';
            } else if (op_att['inports'][ip]['type'] == 'message.table') {
              script_test_content += 'msg'+idx+' = optest.get_msgtable(\'testdata'+idx+'.csv\')\n';
            } else {
              script_test_content += 'msg'+idx+' = api.Message(attributes={\'operator\':\''+this.answers.operator+'\'},body = None)\n';
            }
            script_test_content += script_file.slice(0,-3) + '.on_'+op_att['inports'][ip]['name']+'(msg'+idx+')\n';
          }
        } else {
          script_test_content += script_file.slice(0,-3) + '.gen()\n';
        } 
        script_test_content += `# print result list
for mt in mock_api.msg_list :
  print('*********************')
  print('Port: {}'.format(mt['port']))
  print('Attributes: {}'.format(mt['data'].attributes))
  print('Data: {}'.format(mt['data'].body))
  #print(optest.msgtable2df(mt['data']))  
  `
        this.files_content[script_test] = script_test_content
      }

      // package-operator specific folders
      mkdirp.sync(path.join(this.destinationRoot(),'testdata',this.operator_dir));
      mkdirp.sync(path.join(this.destinationRoot(),'operators',this.operator_dir));
      // storing the operator data
      for (const [filename, content] of Object.entries(this.files_content)) {
        this.fs.write(path.join(this.destinationRoot(),'operators',this.operator_dir,filename), content);
      };

    /*
     *  Upload files from DI
    */
    } else if (this.answers.direction == 'U') {
      this.log('***** Upload *****');
      let source_path = path.join(this.destinationRoot(),'operators',this.operator_dir);
      let target_path = path.join(vflow_operators_path,this.operator_dir);
      //this.log(source_path + ' -> ' + target_path);

      // comment script file
      let operator_json_raw = fs.readFileSync(path.join(source_path,'operator.json'),'utf8');
      let operator_json = JSON.parse(operator_json_raw);
      let script_file = operator_json['config']['script'].slice(7);
      let script_file_path = path.join(source_path,script_file);
      
      let script_content = fs.readFileSync(script_file_path,'utf8');
      script_content = script_content.replace(import_mock_api,'');
      let script_file_tmp = 'tmp_'+script_file
      let script_file_tmp_path = path.join(source_path,script_file_tmp);
      this.log('Write tmp script-file for being uploaded: ' + script_file_tmp_path);
      fs.writeFileSync(script_file_tmp_path, script_content);

      // check if target_path exist
      let di_packages = _vctl_ls(this,'.');
      this.log('Packages on DI: ' +di_packages);
      if ((di_packages.includes(this.package_name))=== false) {
        // package path
        this.log('Package folder does not exist on DI: '+this.package_name);
        let op_package_path = path.join(vflow_operators_path,this.package_name);
        this.log(op_package_path);
        _vctl_mkdir(this,op_package_path);
        let operator_path = path.join(op_package_path,this.operator_name);
        this.log(operator_path);
        _vctl_mkdir(this,operator_path);
        this._adjustOperatorName()
      } else {
        // operator path
        let op_package_path = path.join(vflow_operators_path,this.package_name);
        let di_packages_ops = _vctl_ls(this,this.package_name);
        this.log('Operators in package: ' + di_packages_ops);
        if ((di_packages_ops.includes(this.operator_name))=== false) {
          let operator_path = path.join(op_package_path,this.operator_name);
          this.log('Operator folder does not exist on DI. Created: ' + operator_path);
          _vctl_mkdir(this,operator_path);
          this._adjustOperatorName()
        };
      };

      fs.readdirSync(source_path).forEach(file => {
        if (file == script_file_tmp) {
          _vctl_put(this,path.join(source_path,file),path.join(target_path,script_file));
        } else if ((file !== '__pycache__') && (file !== script_file)) {
          _vctl_put(this,path.join(source_path,file),path.join(target_path,file));
        }
      });
      

    } else {
      this.log('Unknown direction: (D)ownload or (U)pload. ' + this.answers.direction)
    }
  };
};