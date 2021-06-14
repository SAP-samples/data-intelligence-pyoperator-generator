
import os
import pandas as pd

class toapi:
    class Message:
        def __init__(self, body=None, attributes=""):
            self.body = body
            self.attributes = attributes

class operator_test :

    def __init__(self,source_path):
        self.source_path = source_path

    def _filename(self,testdata_file) :
        operator_dir = os.path.dirname(self.source_path)
        operator = os.path.basename(operator_dir)
        package_dir = os.path.dirname(operator_dir)
        package = os.path.basename(package_dir)
        project_root = os.path.dirname(os.path.dirname(package_dir))

        return os.path.join(project_root,'testdata',package,operator, testdata_file)

    #### FILE input (simumlates File data on inport)
    def get_file(self,testdata_file) :
        testfile = self._filename(testdata_file)
        return open(os.path.join(testfile), mode='rb').read()

    #### TABLE INPUT csv-testdata  (simumlates message.table data on inport)
    def get_msgtable(self,testdata_file) :
        hanamap = {'int64': 'BIGINT', 'float64': 'DOUBLE', 'object': 'NVARCHAR', 'bool': 'BOOLEAN'}
        testfile = self._filename(testdata_file)
        df = pd.read_csv(testfile)
        columns = []
        for col in df.columns :
            dty = str(df[col].dtype)
            hanadtype = hanamap[dty]
            columns.append({"class": str(df[col].dtype),"name": col, "type": {"hana": hanadtype }})
        att = {'table':{'columns':columns,'version':1},'table_name':os.path.basename(testfile).split('.')[0]}

        return toapi.Message(attributes=att,body=df.values.tolist())

    def msgtable2df(self,msg):
        header = [c['name'] for c in msg.attributes['table']['columns']]
        return pd.DataFrame(msg.body, columns=header)

