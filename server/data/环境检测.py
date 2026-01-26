import sys
import platform
import importlib.util
import warnings
warnings.filterwarnings("ignore")

def check_python_version():
    """检查Python版本（需3.8及以上）"""
    print("="*50)
    print("1. Python版本检查")
    python_version = sys.version_info
    print(f"当前Python版本：{python_version.major}.{python_version.minor}.{python_version.micro}")
    if python_version >= (3, 8):
        print("✅ Python版本兼容（3.8+）")
        return True
    else:
        print("❌ Python版本不兼容！需安装3.8及以上版本（推荐3.10）")
        return False

def check_dependencies():
    """检查依赖库是否安装及版本是否兼容"""
    print("\n" + "="*50)
    print("2. 依赖库兼容性检查")
    required_libs = {
        "akshare": "1.10.0",  # 最低兼容版本
        "pandas": "1.3.0",
        "numpy": "1.21.0",
        "tkinter": None,  # Python内置，无需版本检查
        "schedule": "1.1.0",
        "openpyxl": "3.0.0"
    }
    all_compatible = True
    missing_libs = []
    
    for lib, min_version in required_libs.items():
        try:
            # 检查是否安装
            spec = importlib.util.find_spec(lib)
            if spec is None:
                print(f"❌ {lib}：未安装")
                missing_libs.append(lib)
                all_compatible = False
                continue
            
            # 检查版本（tkinter除外）
            if lib == "tkinter":
                print(f"✅ tkinter：已安装（Python内置）")
                continue
            
            # 获取版本号
            module = importlib.import_module(lib)
            version = getattr(module, "__version__", "未知版本")
            # 版本号对比（简化版，仅检查主版本和次版本）
            if min_version:
                min_v_list = list(map(int, min_version.split(".")))
                current_v_list = list(map(int, version.split(".")[:len(min_v_list)]))
                if current_v_list >= min_v_list:
                    print(f"✅ {lib}：已安装（版本：{version}，兼容）")
                else:
                    print(f"⚠️ {lib}：版本不兼容（当前：{version}，最低需：{min_version}）")
                    all_compatible = False
            else:
                print(f"✅ {lib}：已安装（版本：{version}）")
        except Exception as e:
            print(f"❌ {lib}：检查失败（错误：{str(e)}）")
            all_compatible = False
    
    # 输出缺失库的安装命令
    if missing_libs:
        print(f"\n⚠️  需安装缺失库，执行以下命令：")
        install_cmd = f"pip install {' '.join(missing_libs)}"
        print(f"pip install {' '.join(missing_libs)}")
    
    return all_compatible

def check_system_permission():
    """检查系统权限（确保能写入文件到桌面）"""
    print("\n" + "="*50)
    print("3. 系统权限检查")
    try:
        import os
        desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
        # 尝试在桌面创建临时文件，验证写入权限
        test_file = os.path.join(desktop_path, "环境检测临时文件.txt")
        with open(test_file, "w", encoding="utf-8") as f:
            f.write("权限测试")
        os.remove(test_file)
        print("✅ 桌面写入权限：正常（可保存Excel和日志文件）")
        return True
    except Exception as e:
        print(f"❌ 桌面写入权限：异常（错误：{str(e)}）")
        print("⚠️  解决方案：以管理员身份运行脚本，或手动指定可写入的保存路径")
        return False

def check_akshare_data_access():
    """检查akshare数据接口可用性（确保能获取A股数据）"""
    print("\n" + "="*50)
    print("4. 数据接口可用性检查")
    try:
        import akshare as ak
        # 尝试获取少量股票数据，验证接口
        stock_list = ak.stock_info_a_code_name().head(10)
        if not stock_list.empty:
            print("✅ akshare数据接口：正常（可获取A股数据）")
            return True
        else:
            print("⚠️ akshare数据接口：返回数据为空（可能是网络问题）")
            return False
    except Exception as e:
        print(f"❌ akshare数据接口：异常（错误：{str(e)}）")
        print("⚠️  解决方案：检查网络连接，或更新akshare到最新版本（pip install --upgrade akshare）")
        return False

def main():
    """主检测流程"""
    print("🎉 Python环境兼容性检测工具")
    print(f"当前系统：{platform.system()} {platform.release()}")
    
    # 执行各项检查
    check_results = [
        check_python_version(),
        check_dependencies(),
        check_system_permission(),
        check_akshare_data_access()
    ]
    
    print("\n" + "="*50)
    print("📊 检测结果汇总")
    if all(check_results):
        print("✅ 所有检测项通过！Python环境兼容，工具可正常运行~")
    else:
        print("⚠️  部分检测项未通过！请按上述提示修复问题后再运行工具~")

if __name__ == "__main__":
    main()